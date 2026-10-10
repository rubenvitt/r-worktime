// Arbeitszeitmuster: wann gearbeitet wird, Pausen, Ruhezeiten und Hinweise
// zum Arbeitszeitgesetz. Reine Funktionen ohne Prisma, auch im Client nutzbar.
//
// Zwei Zeitachsen:
// - Dauern (Netto, Pause, Ruhezeit) in echter verstrichener Zeit (Millisekunden).
// - Uhrzeiten (Beginn, Ende, Heatmap, Histogramm) als Berliner Wanduhrzeit.
// Am Tag der Zeitumstellung weichen beide voneinander ab – gewollt.

import { ADJUSTMENT_MARKER } from "@/lib/adjustment-marker";
import {
  BERLIN_TIME_ZONE,
  berlinDateKey,
  berlinDayStart,
  isoWeekOf,
  shiftDateKey,
  weekdayOfKey,
} from "@/lib/dates";
import { formatDateShort, formatDuration } from "@/lib/format";
import {
  convertPeriod,
  parsePeriodParams,
  periodBounds,
  periodContaining,
  periodSearchParams,
  type ReportPeriod,
} from "./period";

// ---------------------------------------------------------------------------
// Konstanten

/** Lücken darunter sind keine Pause (z. B. Wechsel zwischen Timing-Einträgen). */
export const MIN_GAP_MINUTES = 5;

/**
 * Arbeit, die vor dieser Uhrzeit beginnt, kann zum Vortag zählen (Nachtarbeit) –
 * aber nur, wenn sie an dessen Arbeit anschließt (siehe NIGHT_GAP_MINUTES).
 */
export const DAY_BOUNDARY_MINUTE = 4 * 60;

/**
 * Größte Lücke, nach der ein Block vor 04:00 noch zum Vortag gehört. Nach
 * längerer Lücke (z. B. Frühstart am Reisetag) beginnt ein neuer Arbeitstag.
 */
export const NIGHT_GAP_MINUTES = 3 * 60;

/** Schrittweite der Beginn-/Ende-Verteilung. */
export const HISTOGRAM_BUCKET_MINUTES = 30;

/** Schwellen nach Arbeitszeitgesetz (in Minuten). */
export const ARBZG = {
  /** §3: werktägliche Arbeitszeit, höchstens 10 Stunden */
  maxDailyMinutes: 10 * 60,
  /** §4: mehr als 6 Stunden → mindestens 30 Minuten Pause */
  shortBreakThreshold: 6 * 60,
  shortBreakMinutes: 30,
  /** §4: mehr als 9 Stunden → mindestens 45 Minuten Pause */
  longBreakThreshold: 9 * 60,
  longBreakMinutes: 45,
  /** §4: nur Pausenblöcke ab 15 Minuten zählen */
  minBreakBlockMinutes: 15,
  /** §4: nicht länger als 6 Stunden am Stück ohne Ruhepause */
  maxStretchMinutes: 6 * 60,
  /** §5: mindestens 11 Stunden Ruhezeit */
  minRestMinutes: 11 * 60,
} as const;

/** Wochentage in Anzeige-Reihenfolge Mo bis So (0 = Sonntag wie in workDays). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const WEEKDAY_SHORT: Record<number, string> = {
  0: "So",
  1: "Mo",
  2: "Di",
  3: "Mi",
  4: "Do",
  5: "Fr",
  6: "Sa",
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// ---------------------------------------------------------------------------
// Typen

/** Ausschnitt einer TimeEntry-Zeile, den die Auswertung braucht. */
export interface PatternSourceEntry {
  startTime: Date;
  endTime: Date;
  type: string;
  source: string;
  description: string | null;
}

export type PatternEntryClass =
  | "work"
  | "bulkFill"
  | "adjustment"
  | "holiday"
  | "absence"
  | "invalid";

/** Zeitraum in Millisekunden seit Epoche, Ende exklusiv. */
export interface Interval {
  start: number;
  end: number;
}

/** Minuten seit Mitternacht des Arbeitstags (Wanduhr); > 1440 = nach Mitternacht. */
export interface DaySpan {
  startMinute: number;
  endMinute: number;
}

export interface DayBreak extends DaySpan {
  /** Echte Dauer der Lücke */
  minutes: number;
}

export interface PatternDay {
  /** Arbeitstag "YYYY-MM-DD" (Berlin; Nachtarbeit bis 04:00 zählt zum Vortag) */
  date: string;
  /** 0 = Sonntag … 6 = Samstag */
  weekday: number;
  /** Erster Beginn, Minuten seit Mitternacht (Wanduhr) */
  startMinute: number;
  /** Letztes Ende, Minuten seit Mitternacht des Arbeitstags; > 1440 = Folgetag */
  endMinute: number;
  /** Anwesenheit: letztes Ende − erster Beginn (echte Zeit) */
  spanMinutes: number;
  /** Vereinigung aller Einträge (echte Zeit) */
  netMinutes: number;
  /** Summe der Lücken ab MIN_GAP_MINUTES */
  breakMinutes: number;
  /** Summe der Lücken ab 15 Minuten (zählen für §4) */
  qualifyingBreakMinutes: number;
  /** Längste Arbeitsstrecke ohne Pause von mindestens 15 Minuten */
  longestStretchMinutes: number;
  entryCount: number;
  blocks: DaySpan[];
  breaks: DayBreak[];
}

export type ArbzgRule = "dailyMax" | "breaks" | "rest" | "sundayHoliday";

export const ARBZG_RULES: ArbzgRule[] = [
  "dailyMax",
  "breaks",
  "rest",
  "sundayHoliday",
];

export const ARBZG_RULE_LABELS: Record<
  ArbzgRule,
  { paragraph: string; title: string; short: string }
> = {
  dailyMax: {
    paragraph: "§ 3 ArbZG",
    title: "Mehr als 10 Stunden am Tag",
    short: "Über 10 h",
  },
  breaks: {
    paragraph: "§ 4 ArbZG",
    title: "Pausen zu kurz",
    short: "Pausen",
  },
  rest: {
    paragraph: "§ 5 ArbZG",
    title: "Ruhezeit unter 11 Stunden",
    short: "Ruhezeit",
  },
  sundayHoliday: {
    paragraph: "§ 9 ArbZG",
    title: "Arbeit an Sonn- und Feiertagen",
    short: "Sonn-/Feiertag",
  },
};

interface FindingBase {
  date: string;
  isoYear: number;
  isoWeek: number;
}

export type ArbzgFinding =
  | (FindingBase & { rule: "dailyMax"; netMinutes: number })
  | (FindingBase & {
      rule: "breaks";
      netMinutes: number;
      requiredBreakMinutes: number;
      qualifyingBreakMinutes: number;
      insufficientBreak: boolean;
      longStretch: boolean;
      longestStretchMinutes: number;
    })
  | (FindingBase & {
      rule: "rest";
      restMinutes: number;
      previousDate: string;
    })
  | (FindingBase & {
      rule: "sundayHoliday";
      workedMinutes: number;
      isSunday: boolean;
      holidayName: string | null;
    });

export interface DayMinute {
  date: string;
  minute: number;
}

export interface PatternSummary {
  days: number;
  totalNetMinutes: number;
  avgStartMinute: number;
  medianStartMinute: number;
  avgEndMinute: number;
  medianEndMinute: number;
  avgNetMinutes: number;
  medianNetMinutes: number;
  avgBreakMinutes: number;
  avgSpanMinutes: number;
  earliestStart: DayMinute;
  /** Späteste Enden, spätestes zuerst (höchstens 5) */
  latestEnds: DayMinute[];
}

export interface WeekdayPattern {
  weekday: number;
  days: number;
  avgNetMinutes: number | null;
  avgStartMinute: number | null;
  avgEndMinute: number | null;
  avgBreakMinutes: number | null;
}

export interface HeatmapRow {
  weekday: number;
  /** Kalendertage dieses Wochentags mit Arbeit (Nenner für share) */
  days: number;
  /** Gearbeitete Minuten je Stunde 0–23 (Wanduhr) */
  minutes: number[];
  /** minutes / (days × 60), 0–1 */
  share: number[];
}

export interface HistogramBucket {
  /** Beginn des Buckets, Minuten seit Mitternacht des Arbeitstags */
  minute: number;
  count: number;
}

export interface PatternExclusions {
  /** Tage mit aufgefüllten Einträgen (synthetische Uhrzeiten) */
  bulkFillDays: number;
  /** Saldo-Buchungen */
  adjustmentEntries: number;
  /** Einträge ohne positive Dauer */
  invalidEntries: number;
}

export interface PatternsReport {
  from: string;
  to: string;
  summary: PatternSummary | null;
  weekdays: WeekdayPattern[];
  heatmap: HeatmapRow[];
  histogram: {
    bucketMinutes: number;
    start: HistogramBucket[];
    end: HistogramBucket[];
  };
  days: PatternDay[];
  findings: ArbzgFinding[];
  findingCounts: Record<ArbzgRule, number>;
  /** Anzahl Tage mit mindestens einem Hinweis */
  findingDays: number;
  excluded: PatternExclusions;
}

// ---------------------------------------------------------------------------
// Klassifizierung

const EXCLUDED_SOURCES: Record<string, PatternEntryClass> = {
  BULK_FILL: "bulkFill",
  ADJUSTMENT: "adjustment",
  HOLIDAY: "holiday",
};

/** Nur echte Arbeit zählt: Typ WORK, keine Auffüllung, kein Saldo, kein Feiertag. */
export function classifyPatternEntry(
  entry: PatternSourceEntry,
): PatternEntryClass {
  // Erst nach Art einordnen: der Saldo hat Beginn = Ende und ist trotzdem kein Fehler
  const bySource = EXCLUDED_SOURCES[entry.source];
  if (bySource) return bySource;
  // OVERTIME ist in dieser App ausschließlich die Saldo-Buchung
  if (entry.type === "OVERTIME") return "adjustment";
  if (entry.description?.includes(ADJUSTMENT_MARKER)) return "adjustment";
  if (entry.type === "HOLIDAY") return "holiday";
  if (entry.type !== "WORK") return "absence";
  const start = entry.startTime.getTime();
  const end = entry.endTime.getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return "invalid";
  }
  return "work";
}

// ---------------------------------------------------------------------------
// Intervalle und Wanduhr

/** Vereinigung: überlappende, verschachtelte und angrenzende Intervalle verschmelzen. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }
  return merged;
}

const wallFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BERLIN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface WallTime {
  /** Kalendertag in Berlin */
  key: string;
  /** Minuten seit Mitternacht (Wanduhr), inklusive Sekundenanteil */
  minute: number;
}

function berlinWall(ms: number): WallTime {
  const parts = wallFormatter.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  return {
    key: `${get("year")}-${get("month")}-${get("day")}`,
    minute:
      Number(get("hour")) * 60 +
      Number(get("minute")) +
      Number(get("second")) / 60,
  };
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round(
    (berlinDayStart(toKey).getTime() - berlinDayStart(fromKey).getTime()) /
      DAY_MS,
  );
}

/** Wanduhr-Minute eines Zeitpunkts relativ zur Mitternacht des Arbeitstags. */
function minuteInDay(ms: number, dayKey: string): number {
  const wall = berlinWall(ms);
  return wall.minute + 1440 * daysBetween(dayKey, wall.key);
}

/**
 * Arbeitstag je Block (sortiert, disjunkt): Ein Block vor 04:00 gehört zum Tag
 * des vorherigen Blocks, wenn er nach weniger als NIGHT_GAP_MINUTES anschließt
 * und dieser Tag höchstens der Vortag ist. Sonst zählt der Kalendertag.
 */
function workDayKeys(blocks: Interval[]): string[] {
  const keys: string[] = [];
  blocks.forEach((block, index) => {
    const wall = berlinWall(block.start);
    const previous = blocks[index - 1];
    const previousKey = keys[index - 1];
    const continues =
      wall.minute < DAY_BOUNDARY_MINUTE &&
      previous !== undefined &&
      block.start - previous.end < NIGHT_GAP_MINUTES * MINUTE_MS &&
      previousKey >= shiftDateKey(wall.key, -1);
    keys.push(continues ? previousKey : wall.key);
  });
  return keys;
}

const toMinutes = (msValue: number) => Math.round(msValue / MINUTE_MS);

// ---------------------------------------------------------------------------
// Tage

interface DayWork {
  day: PatternDay;
  blocks: Interval[];
}

/** Binärsuche in sortierten, disjunkten Blöcken. */
function blockContaining(blocks: Interval[], ms: number): Interval | null {
  let low = 0;
  let high = blocks.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const block = blocks[mid];
    if (ms < block.start) high = mid - 1;
    else if (ms >= block.end) low = mid + 1;
    else return block;
  }
  return null;
}

function buildDayWork(entries: PatternSourceEntry[]): DayWork[] {
  const work = entries.filter((e) => classifyPatternEntry(e) === "work");
  const merged = mergeIntervals(
    work.map((e) => ({
      start: e.startTime.getTime(),
      end: e.endTime.getTime(),
    })),
  );

  const keys = workDayKeys(merged);
  const keyOfBlock = new Map<Interval, string>();
  const blocksByDay = new Map<string, Interval[]>();
  merged.forEach((block, index) => {
    const key = keys[index];
    keyOfBlock.set(block, key);
    const list = blocksByDay.get(key);
    if (list) list.push(block);
    else blocksByDay.set(key, [block]);
  });

  const entryCountByDay = new Map<string, number>();
  for (const e of work) {
    // Eintrag gehört zum Tag des Blocks, in dem sein Beginn liegt
    const block = blockContaining(merged, e.startTime.getTime());
    const key = block ? keyOfBlock.get(block) : undefined;
    if (!key) continue;
    entryCountByDay.set(key, (entryCountByDay.get(key) ?? 0) + 1);
  }

  return [...blocksByDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, blocks]) => ({
      day: describeDay(date, blocks, entryCountByDay.get(date) ?? 0),
      blocks,
    }));
}

function describeDay(
  date: string,
  blocks: Interval[],
  entryCount: number,
): PatternDay {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  const breaks: DayBreak[] = [];
  let netMs = 0;
  let stretchMs = 0;
  let longestStretchMs = 0;
  let qualifyingBreakMinutes = 0;

  blocks.forEach((block, index) => {
    if (index > 0) {
      const gap = toMinutes(block.start - blocks[index - 1].end);
      if (gap >= MIN_GAP_MINUTES) {
        breaks.push({
          startMinute: minuteInDay(blocks[index - 1].end, date),
          endMinute: minuteInDay(block.start, date),
          minutes: gap,
        });
      }
      if (gap >= ARBZG.minBreakBlockMinutes) {
        qualifyingBreakMinutes += gap;
        stretchMs = 0;
      }
    }
    const duration = block.end - block.start;
    netMs += duration;
    stretchMs += duration;
    longestStretchMs = Math.max(longestStretchMs, stretchMs);
  });

  return {
    date,
    weekday: weekdayOfKey(date),
    startMinute: minuteInDay(first.start, date),
    endMinute: minuteInDay(last.end, date),
    spanMinutes: toMinutes(last.end - first.start),
    netMinutes: toMinutes(netMs),
    breakMinutes: breaks.reduce((sum, b) => sum + b.minutes, 0),
    qualifyingBreakMinutes,
    longestStretchMinutes: toMinutes(longestStretchMs),
    entryCount,
    blocks: blocks.map((b) => ({
      startMinute: minuteInDay(b.start, date),
      endMinute: minuteInDay(b.end, date),
    })),
    breaks,
  };
}

/** Arbeitstage aus Einträgen; ausgeschlossene Einträge werden ignoriert. */
export function buildPatternDays(entries: PatternSourceEntry[]): PatternDay[] {
  return buildDayWork(entries).map((d) => d.day);
}

// ---------------------------------------------------------------------------
// Zeitraum

/** Zeitraum: Monat, Quartal oder Jahr wie in allen Berichten, dazu „letzte 90 Tage“. */
export type PatternPeriod = ReportPeriod | { kind: "last90" };
export type PatternPeriodKind = PatternPeriod["kind"];

export const LAST90_OPTION = { value: "last90", label: "90 Tage" } as const;

export interface PatternRange {
  from: string;
  to: string;
  /** Ende der Auswertung: höchstens gestern (der laufende Tag ist nicht fertig) */
  effectiveTo: string;
  /** Kein abgeschlossener Tag im Zeitraum */
  isEmpty: boolean;
}

/** Liest ?period=<Art>&key=<Schlüssel> oder ?period=last90; null = ungültig. */
export function parsePatternPeriod(
  params: URLSearchParams,
): PatternPeriod | null {
  if (params.get("period") === "last90") return { kind: "last90" };
  return parsePeriodParams(params);
}

/** Gegenstück zu parsePatternPeriod. */
export function patternPeriodParams(period: PatternPeriod): URLSearchParams {
  if (period.kind === "last90")
    return new URLSearchParams({ period: "last90" });
  return periodSearchParams(period);
}

/**
 * Wechsel der Zeitraum-Art: aus „90 Tage“ in den laufenden Zeitraum, sonst
 * wie convertPeriod (der angezeigte Zeitraum bleibt erhalten).
 */
export function switchPatternPeriod(
  period: PatternPeriod,
  kind: PatternPeriodKind,
  todayKey: string,
): PatternPeriod {
  if (kind === period.kind) return period;
  if (kind === "last90") return { kind: "last90" };
  if (period.kind === "last90") return periodContaining(kind, todayKey);
  return convertPeriod(period, kind, todayKey);
}

export function resolvePatternRange(
  period: PatternPeriod,
  todayKey: string,
): PatternRange {
  const yesterday = shiftDateKey(todayKey, -1);
  let from: string;
  let to: string;
  if (period.kind === "last90") {
    from = shiftDateKey(yesterday, -89);
    to = yesterday;
  } else {
    const bounds = periodBounds(period);
    from = bounds.firstKey;
    to = bounds.lastKey;
  }
  const effectiveTo = to < yesterday ? to : yesterday;
  return { from, to, effectiveTo, isEmpty: effectiveTo < from };
}

// ---------------------------------------------------------------------------
// Statistik

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function summarize(days: PatternDay[]): PatternSummary | null {
  if (days.length === 0) return null;
  const starts = days.map((d) => d.startMinute);
  const ends = days.map((d) => d.endMinute);
  const nets = days.map((d) => d.netMinutes);
  const earliest = days.reduce((best, d) =>
    d.startMinute < best.startMinute ? d : best,
  );
  return {
    days: days.length,
    totalNetMinutes: nets.reduce((sum, v) => sum + v, 0),
    avgStartMinute: mean(starts),
    medianStartMinute: median(starts),
    avgEndMinute: mean(ends),
    medianEndMinute: median(ends),
    avgNetMinutes: mean(nets),
    medianNetMinutes: median(nets),
    avgBreakMinutes: mean(days.map((d) => d.breakMinutes)),
    avgSpanMinutes: mean(days.map((d) => d.spanMinutes)),
    earliestStart: { date: earliest.date, minute: earliest.startMinute },
    latestEnds: [...days]
      .sort((a, b) => b.endMinute - a.endMinute || (a.date < b.date ? 1 : -1))
      .slice(0, 5)
      .map((d) => ({ date: d.date, minute: d.endMinute })),
  };
}

function weekdayPatterns(days: PatternDay[]): WeekdayPattern[] {
  return WEEKDAY_ORDER.map((weekday) => {
    const list = days.filter((d) => d.weekday === weekday);
    if (list.length === 0) {
      return {
        weekday,
        days: 0,
        avgNetMinutes: null,
        avgStartMinute: null,
        avgEndMinute: null,
        avgBreakMinutes: null,
      };
    }
    return {
      weekday,
      days: list.length,
      avgNetMinutes: mean(list.map((d) => d.netMinutes)),
      avgStartMinute: mean(list.map((d) => d.startMinute)),
      avgEndMinute: mean(list.map((d) => d.endMinute)),
      avgBreakMinutes: mean(list.map((d) => d.breakMinutes)),
    };
  });
}

interface CalendarPiece {
  /** Berliner Kalendertag */
  key: string;
  hour: number;
  minutes: number;
}

/**
 * Zerlegt Blöcke an vollen UTC-Stunden. Berlins Offset ist immer ganzstündig,
 * jedes Stück liegt damit in genau einer Berliner Stunde – auch an Tagen der
 * Zeitumstellung (doppelte bzw. fehlende Stunde).
 */
function calendarPieces(blocks: Interval[]): CalendarPiece[] {
  const pieces: CalendarPiece[] = [];
  for (const block of blocks) {
    let cursor = block.start;
    while (cursor < block.end) {
      const next = Math.min(
        block.end,
        Math.floor(cursor / HOUR_MS) * HOUR_MS + HOUR_MS,
      );
      const wall = berlinWall(cursor);
      pieces.push({
        key: wall.key,
        hour: Math.floor(wall.minute / 60),
        minutes: (next - cursor) / MINUTE_MS,
      });
      cursor = next;
    }
  }
  return pieces;
}

function buildHeatmap(pieces: CalendarPiece[]): HeatmapRow[] {
  const minutes = new Map<number, number[]>();
  const keys = new Map<number, Set<string>>();
  for (const weekday of WEEKDAY_ORDER) {
    minutes.set(weekday, Array(24).fill(0));
    keys.set(weekday, new Set());
  }
  for (const piece of pieces) {
    const weekday = weekdayOfKey(piece.key);
    const row = minutes.get(weekday);
    if (row) row[piece.hour] += piece.minutes;
    keys.get(weekday)?.add(piece.key);
  }
  return WEEKDAY_ORDER.map((weekday) => {
    const row = (minutes.get(weekday) ?? []).map(
      (m) => Math.round(m * 10) / 10,
    );
    const days = keys.get(weekday)?.size ?? 0;
    return {
      weekday,
      days,
      minutes: row,
      share: row.map((m) => (days > 0 ? Math.min(1, m / (days * 60)) : 0)),
    };
  });
}

function histogram(values: number[]): HistogramBucket[] {
  if (values.length === 0) return [];
  const size = HISTOGRAM_BUCKET_MINUTES;
  const bucketOf = (v: number) => Math.floor(Math.round(v) / size) * size;
  const counts = new Map<number, number>();
  for (const v of values) {
    const bucket = bucketOf(v);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const min = Math.min(...counts.keys());
  const max = Math.max(...counts.keys());
  const buckets: HistogramBucket[] = [];
  for (let minute = min; minute <= max; minute += size) {
    buckets.push({ minute, count: counts.get(minute) ?? 0 });
  }
  return buckets;
}

/**
 * Achsenbeschriftung fürs Histogramm: nur volle Stunden, bei vielen Stunden
 * jede zweite, dritte … (Schritt als Vielfaches der Stunde, höchstens
 * `maxTicks` Beschriftungen). Der letzte Bucket wird nicht extra beschriftet.
 */
export function histogramTicks(
  buckets: readonly HistogramBucket[],
  maxTicks = 8,
): number[] {
  if (buckets.length === 0) return [];
  const minutes = buckets.map((b) => b.minute);
  const first = Math.ceil(Math.min(...minutes) / 60) * 60;
  const last = Math.max(...minutes);
  const hours = Math.floor((last - first) / 60) + 1;
  if (hours <= 0) return [];
  const step = Math.max(1, Math.ceil(hours / maxTicks)) * 60;
  const start = Math.ceil(first / step) * step;
  const ticks: number[] = [];
  for (let minute = start; minute <= last; minute += step) ticks.push(minute);
  return ticks;
}

// ---------------------------------------------------------------------------
// Arbeitszeitgesetz

function findingBase(date: string): FindingBase {
  const { year, week } = isoWeekOf(date);
  return { date, isoYear: year, isoWeek: week };
}

function dayFindings(
  work: DayWork,
  previous: DayWork | undefined,
): ArbzgFinding[] {
  const { day } = work;
  const findings: ArbzgFinding[] = [];

  if (day.netMinutes > ARBZG.maxDailyMinutes) {
    findings.push({
      ...findingBase(day.date),
      rule: "dailyMax",
      netMinutes: day.netMinutes,
    });
  }

  const requiredBreakMinutes =
    day.netMinutes > ARBZG.longBreakThreshold
      ? ARBZG.longBreakMinutes
      : day.netMinutes > ARBZG.shortBreakThreshold
        ? ARBZG.shortBreakMinutes
        : 0;
  const insufficientBreak = day.qualifyingBreakMinutes < requiredBreakMinutes;
  const longStretch = day.longestStretchMinutes > ARBZG.maxStretchMinutes;
  if (insufficientBreak || longStretch) {
    findings.push({
      ...findingBase(day.date),
      rule: "breaks",
      netMinutes: day.netMinutes,
      requiredBreakMinutes,
      qualifyingBreakMinutes: day.qualifyingBreakMinutes,
      insufficientBreak,
      longStretch,
      longestStretchMinutes: day.longestStretchMinutes,
    });
  }

  if (previous) {
    const previousEnd = previous.blocks[previous.blocks.length - 1].end;
    const restMinutes = toMinutes(work.blocks[0].start - previousEnd);
    if (restMinutes < ARBZG.minRestMinutes) {
      findings.push({
        ...findingBase(day.date),
        rule: "rest",
        restMinutes,
        previousDate: previous.day.date,
      });
    }
  }

  return findings;
}

function sundayHolidayFindings(
  pieces: CalendarPiece[],
  from: string,
  to: string,
  holidays: Record<string, string>,
): ArbzgFinding[] {
  const minutesByKey = new Map<string, number>();
  for (const piece of pieces) {
    if (piece.key < from || piece.key > to) continue;
    const isSunday = weekdayOfKey(piece.key) === 0;
    if (!isSunday && !holidays[piece.key]) continue;
    minutesByKey.set(
      piece.key,
      (minutesByKey.get(piece.key) ?? 0) + piece.minutes,
    );
  }
  return [...minutesByKey.entries()].map(([key, minutes]) => ({
    ...findingBase(key),
    rule: "sundayHoliday" as const,
    workedMinutes: Math.round(minutes),
    isSunday: weekdayOfKey(key) === 0,
    holidayName: holidays[key] ?? null,
  }));
}

/** Formuliert einen Hinweis als kurzen Satz (ohne Paragraf). */
export function describeFinding(finding: ArbzgFinding): string {
  switch (finding.rule) {
    case "dailyMax":
      return `${formatDuration(finding.netMinutes)} netto gearbeitet (mehr als 10 Stunden)`;
    case "breaks": {
      const parts: string[] = [];
      if (finding.insufficientBreak) {
        parts.push(
          `${formatDuration(finding.qualifyingBreakMinutes)} Pause bei ${formatDuration(finding.netMinutes)} netto (vorgesehen: mindestens ${formatDuration(finding.requiredBreakMinutes)})`,
        );
      }
      if (finding.longStretch) {
        parts.push(
          `${formatDuration(finding.longestStretchMinutes)} am Stück ohne Pause von mindestens ${ARBZG.minBreakBlockMinutes} Minuten`,
        );
      }
      return parts.join("; ");
    }
    case "rest":
      return `${formatDuration(finding.restMinutes)} Ruhezeit seit Arbeitsende am ${formatDateShort(finding.previousDate)}`;
    case "sundayHoliday":
      return finding.holidayName
        ? `${formatDuration(finding.workedMinutes)} am Feiertag gearbeitet (${finding.holidayName})`
        : `${formatDuration(finding.workedMinutes)} am Sonntag gearbeitet`;
  }
}

// ---------------------------------------------------------------------------
// Gesamtauswertung

export interface AnalyzeOptions {
  /** Erster Tag (inklusive) */
  from: string;
  /** Letzter Tag (inklusive) */
  to: string;
  /** Feiertage im Zeitraum: Key → Name */
  holidays: Record<string, string>;
}

/**
 * Wertet Einträge für [from, to] aus. Einträge außerhalb dürfen enthalten sein:
 * Der Arbeitstag vor `from` dient nur der Ruhezeit-Prüfung (§5).
 */
export function analyzePatterns(
  entries: PatternSourceEntry[],
  options: AnalyzeOptions,
): PatternsReport {
  const { from, to, holidays } = options;
  const allWork = buildDayWork(entries);

  const inRange: DayWork[] = [];
  const findings: ArbzgFinding[] = [];
  allWork.forEach((work, index) => {
    if (work.day.date < from || work.day.date > to) return;
    inRange.push(work);
    findings.push(...dayFindings(work, allWork[index - 1]));
  });

  const days = inRange.map((w) => w.day);
  const pieces = calendarPieces(inRange.flatMap((w) => w.blocks));
  findings.push(...sundayHolidayFindings(pieces, from, to, holidays));

  const ruleOrder = (rule: ArbzgRule) => ARBZG_RULES.indexOf(rule);
  findings.sort((a, b) =>
    a.date !== b.date
      ? a.date < b.date
        ? 1
        : -1
      : ruleOrder(a.rule) - ruleOrder(b.rule),
  );

  const findingCounts = Object.fromEntries(
    ARBZG_RULES.map((rule) => [
      rule,
      findings.filter((f) => f.rule === rule).length,
    ]),
  ) as Record<ArbzgRule, number>;

  return {
    from,
    to,
    summary: summarize(days),
    weekdays: weekdayPatterns(days),
    heatmap: buildHeatmap(pieces),
    histogram: {
      bucketMinutes: HISTOGRAM_BUCKET_MINUTES,
      start: histogram(days.map((d) => d.startMinute)),
      end: histogram(days.map((d) => d.endMinute)),
    },
    days,
    findings,
    findingCounts,
    findingDays: new Set(findings.map((f) => f.date)).size,
    excluded: countExclusions(entries, from, to),
  };
}

function countExclusions(
  entries: PatternSourceEntry[],
  from: string,
  to: string,
): PatternExclusions {
  const bulkFillDays = new Set<string>();
  let adjustmentEntries = 0;
  let invalidEntries = 0;
  for (const entry of entries) {
    const kind = classifyPatternEntry(entry);
    if (kind === "work" || kind === "holiday" || kind === "absence") continue;
    const start = entry.startTime.getTime();
    const key = Number.isNaN(start) ? null : berlinDateKey(entry.startTime);
    if (key !== null && (key < from || key > to)) continue;
    if (kind === "bulkFill" && key) bulkFillDays.add(key);
    else if (kind === "adjustment") adjustmentEntries++;
    else if (kind === "invalid") invalidEntries++;
  }
  return {
    bulkFillDays: bulkFillDays.size,
    adjustmentEntries,
    invalidEntries,
  };
}

/** Antwort von GET /api/reports/patterns. */
export interface PatternsResponse extends PatternsReport {
  period: PatternPeriod;
  range: PatternRange;
  /** Feiertagseinträge im Zeitraum (Quelle für §9) */
  holidayCount: number;
}

// ---------------------------------------------------------------------------
// Anzeige

/** 485 → "08:05", 1530 → "01:30 (+1)", null → "—" */
export function formatClock(minute: number | null | undefined): string {
  if (minute === null || minute === undefined || Number.isNaN(minute)) {
    return "—";
  }
  const rounded = Math.round(minute);
  const dayOffset = Math.floor(rounded / 1440);
  const inDay = rounded - dayOffset * 1440;
  const text = `${String(Math.floor(inDay / 60)).padStart(2, "0")}:${String(inDay % 60).padStart(2, "0")}`;
  return dayOffset > 0 ? `${text} (+${dayOffset})` : text;
}
