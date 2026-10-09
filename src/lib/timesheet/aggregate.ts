// Stundenzettel-Aggregation – Port der r-times-Logik (src/App.svelte, Stand 07a7ddd).
// Verhalten 1:1 bis auf die konfigurierbare Tagesgrenze (r-times: UTC).

import { BERLIN_TIME_ZONE, zonedDateKey } from "@/lib/dates";

export const ROUNDING_OPTIONS = [5, 10, 15, 30, 60] as const;
export type Rounding = (typeof ROUNDING_OPTIONS)[number];
export const DEFAULT_ROUNDING: Rounding = 15;

export type DayBoundary = "Europe/Berlin" | "UTC";
export const DEFAULT_DAY_BOUNDARY: DayBoundary = "Europe/Berlin";

export const UNTITLED = "Ohne Titel";

export const TRAVEL_KEYWORDS = [
  "präsenztag",
  "präsenz",
  "vor ort",
  "vorort",
  "dienstreise",
  "onsite",
  "on-site",
  "on site",
] as const;

/** Normalisierter Eingabedatensatz; Reihenfolge = Eingabereihenfolge. */
export interface TimesheetRecord {
  start: Date;
  end: Date;
  title: string;
  notes: string;
}

export interface TimesheetActivity {
  title: string;
  minutes: number;
  notes: string[];
  isTitleWithParentheses: boolean;
  hasMissingEntries: boolean;
  isCritical: boolean;
}

export interface TimesheetMissingEntry {
  activity: string;
  /** "HH:MM" in der Zeitzone der Tagesgrenze */
  start: string;
  end: string;
  isCritical: boolean;
}

export interface TimesheetDay {
  date: string;
  minutes: number;
  /** nach Minuten absteigend, stabil */
  activities: TimesheetActivity[];
  hasCriticalActivities: boolean;
  hasIncompleteActivities: boolean;
  missingEntries: TimesheetMissingEntry[];
  /** Anzahl Einträge ohne Notiz in kritischen Aktivitäten (r-times-Badge) */
  criticalCount: number;
  /** Vorschlag aus den Keywords */
  travelFee: boolean;
}

/** Ausgabe-Vertrag für Clipboard und Odoo-Extension. */
export interface TimesheetEntry {
  date: string;
  hours: string;
  text: string;
  travelFee: boolean;
}

export interface AggregateOptions {
  dayBoundary?: DayBoundary;
}

export function isRounding(value: number): value is Rounding {
  return (ROUNDING_OPTIONS as readonly number[]).includes(value);
}

export function isTitleWithParentheses(title: string): boolean {
  return /^.+\(.+\)$/.test(title.trim());
}

/** Rundet die Minuten auf die Einheit (Math.round) und formatiert "H:MM". */
export function formatMinutes(minutes: number, rounding: Rounding): string {
  return formatClock(Math.round(minutes / rounding) * rounding);
}

/** Minuten → "H:MM" ohne Rundung (Stunden ungepaddet). */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

export function detectTravelFee(
  activities: Pick<TimesheetActivity, "title" | "notes">[],
): boolean {
  for (const act of activities) {
    const haystack = `${act.title} ${act.notes.join(" ")}`.toLowerCase();
    for (const keyword of TRAVEL_KEYWORDS) {
      if (haystack.includes(keyword)) return true;
    }
  }
  return false;
}

/** Einzelzeile einer Aktivität: "Titel # n1, n2" (ohne Meeting-Gruppierung). */
export function formatActivityLine(
  activity: Pick<TimesheetActivity, "title" | "notes">,
): string {
  const notes = activity.notes.join(", ");
  return notes ? `${activity.title} # ${notes}` : activity.title;
}

/**
 * Tagestext: "Meetings(a, b)" zuerst (deren Notizen entfallen),
 * danach reguläre Aktivitäten, alles mit "; " verbunden.
 */
export function formatActivitiesText(
  activities: Pick<TimesheetActivity, "title" | "notes">[],
): string {
  const meetingGroups = new Map<string, string[]>();
  const regularLines: string[] = [];

  for (const act of activities) {
    // bewusst ohne trim: nur exakt "Meetings(...)" wird gruppiert
    const match = act.title.match(/^(.+)\((.+)\)$/);
    if (match && match[1] === "Meetings") {
      const [, baseName, content] = match;
      const group = meetingGroups.get(baseName);
      if (group) group.push(content);
      else meetingGroups.set(baseName, [content]);
    } else {
      regularLines.push(formatActivityLine(act));
    }
  }

  const meetingLines = Array.from(meetingGroups.entries()).map(
    ([baseName, contents]) => `${baseName}(${contents.join(", ")})`,
  );
  return [...meetingLines, ...regularLines].join("; ");
}

function utcTime(date: Date): string {
  return date.toISOString().slice(11, 16);
}

const berlinTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BERLIN_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function berlinTime(date: Date): string {
  return berlinTimeFormatter.format(date);
}

function dayKeyFor(date: Date, boundary: DayBoundary): string {
  return boundary === "UTC"
    ? date.toISOString().slice(0, 10)
    : zonedDateKey(date, BERLIN_TIME_ZONE);
}

interface ActivityAccumulator {
  minutes: number;
  notes: string[];
  isTitleWithParentheses: boolean;
  entries: { hasNotes: boolean; start: string; end: string }[];
}

/** Gruppiert Tag → exakter Titel; Tage aufsteigend. */
export function aggregateTimesheet(
  records: Iterable<TimesheetRecord>,
  options: AggregateOptions = {},
): TimesheetDay[] {
  const boundary = options.dayBoundary ?? DEFAULT_DAY_BOUNDARY;
  const timeOf = boundary === "UTC" ? utcTime : berlinTime;
  const dayMap = new Map<
    string,
    { total: number; activities: Map<string, ActivityAccumulator> }
  >();

  for (const record of records) {
    const startMs = record.start.getTime();
    const endMs = record.end.getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;

    const date = dayKeyFor(record.start, boundary);
    // negative Dauern werden wie in r-times nicht gefiltert
    const minutes = Math.round((endMs - startMs) / 60000);

    let day = dayMap.get(date);
    if (!day) {
      day = { total: 0, activities: new Map() };
      dayMap.set(date, day);
    }
    day.total += minutes;

    const title = record.title;
    const note = record.notes;
    const hasParentheses = isTitleWithParentheses(title);

    let act = day.activities.get(title);
    if (!act) {
      act = {
        minutes: 0,
        notes: [],
        isTitleWithParentheses: hasParentheses,
        entries: [],
      };
      day.activities.set(title, act);
    }
    act.minutes += minutes;
    act.isTitleWithParentheses = hasParentheses;
    if (note && !act.notes.includes(note)) act.notes.push(note);
    act.entries.push({
      hasNotes: !!note || hasParentheses,
      start: timeOf(record.start),
      end: timeOf(record.end),
    });
  }

  return Array.from(dayMap.entries())
    .map(([date, { total, activities: activityMap }]) => {
      const activities: TimesheetActivity[] = [];
      const missingEntries: TimesheetMissingEntry[] = [];
      let hasCriticalActivities = false;
      let hasIncompleteActivities = false;

      for (const [title, acc] of activityMap.entries()) {
        const withoutNotes = acc.entries.filter((e) => !e.hasNotes);
        const isCritical =
          acc.notes.length === 0 && !acc.isTitleWithParentheses;
        if (isCritical) hasCriticalActivities = true;
        const hasMissingEntries = withoutNotes.length > 0 && !isCritical;
        if (hasMissingEntries) hasIncompleteActivities = true;

        activities.push({
          title,
          minutes: acc.minutes,
          notes: acc.notes,
          isTitleWithParentheses: acc.isTitleWithParentheses,
          hasMissingEntries,
          isCritical,
        });
        for (const entry of withoutNotes) {
          missingEntries.push({
            activity: title,
            start: entry.start,
            end: entry.end,
            isCritical,
          });
        }
      }

      // Array.prototype.sort ist stabil: Gleichstand behält Einfügereihenfolge
      const sorted = activities.sort((a, b) => b.minutes - a.minutes);
      return {
        date,
        minutes: total,
        activities: sorted,
        hasCriticalActivities,
        hasIncompleteActivities,
        missingEntries,
        criticalCount: missingEntries.filter((e) => e.isCritical).length,
        travelFee: detectTravelFee(sorted),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Ein Element pro Tag, aufsteigend. Overrides schalten travelFee pro Datum um. */
export function buildTimesheetPayload(
  days: Pick<TimesheetDay, "date" | "minutes" | "activities" | "travelFee">[],
  rounding: Rounding,
  travelFeeOverrides: Readonly<Record<string, boolean>> = {},
): TimesheetEntry[] {
  return days.map((day) => ({
    date: day.date,
    hours: formatMinutes(day.minutes, rounding),
    text: formatActivitiesText(day.activities),
    travelFee: travelFeeOverrides[day.date] ?? day.travelFee,
  }));
}

type RawRecord = Record<string, unknown>;

function asText(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

/**
 * Liest Timing-JSON wie r-times: Array, sonst `records`, sonst `activities`.
 * Fallbacks: start||startDate, end||endDate||stopDate,
 * activityTitle||project||"Ohne Titel", notes??"".
 * Ungültige Zeitpunkte werden später in aggregateTimesheet übersprungen.
 */
export function normalizeRawRecords(input: unknown): TimesheetRecord[] {
  let raw: unknown[] = [];
  if (Array.isArray(input)) {
    raw = input;
  } else if (input && typeof input === "object") {
    const obj = input as RawRecord;
    const list = obj.records ?? obj.activities ?? [];
    raw = Array.isArray(list) ? list : [];
  }

  return raw
    .filter((rec): rec is RawRecord => !!rec && typeof rec === "object")
    .map((rec) => {
      const title = rec.activityTitle || rec.project || UNTITLED;
      const notes = rec.notes ?? "";
      return {
        start: new Date((rec.start || rec.startDate) as string),
        end: new Date((rec.end || rec.endDate || rec.stopDate) as string),
        title: asText(title),
        notes: asText(notes),
      };
    });
}
