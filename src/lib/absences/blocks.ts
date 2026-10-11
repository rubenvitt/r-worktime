// Blöcke für die Liste „Abwesenheiten {Jahr}“: Abwesenheiten (Timewarp,
// manuell) plus lose Abwesenheitseinträge ohne verknüpfte Abwesenheit (Timing-
// Sync, Datei-Import, Altbestand), zusammengefasst zu Blöcken aufeinander-
// folgender Arbeitstage. Rein; die Route liefert Daten, Einstellungen und
// Feiertage.

import { shiftDateKey, weekdayOfKey } from "@/lib/dates";
import { hoursToAbsenceDays } from "@/lib/reports/absences";
import type { AbsenceKind } from "./kinds";

export type AbsenceBlockSource = "TIMEWARP" | "MANUAL" | "TIMING";
export type AbsenceBlockStatus = "ACTIVE" | "CANCELLED";
export type AbsenceBlockState = "planned" | "taken" | "partial" | "cancelled";

/** Antwortzeile von GET /api/absences */
export interface AbsenceBlock {
  /** Id der Abwesenheit; null bei losen Einträgen */
  id: string | null;
  source: AbsenceBlockSource;
  kind: AbsenceKind;
  /** Kalendertage "YYYY-MM-DD", beide inklusive */
  from: string;
  to: string;
  halfDay: boolean;
  status: AbsenceBlockStatus;
  state: AbsenceBlockState;
  /** Arbeitstage ohne Feiertage, halbe Tage als 0,5 */
  days: number;
  /** Nur manuelle Abwesenheiten lassen sich als Ganzes löschen */
  deletable: boolean;
}

/** Antwort von GET /api/absences?year=YYYY */
export interface AbsenceBlocksResponse {
  year: number;
  todayKey: string;
  blocks: AbsenceBlock[];
}

export interface AbsenceRow {
  id: string;
  source: "TIMEWARP" | "MANUAL";
  kind: AbsenceKind;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  status: AbsenceBlockStatus;
  /** Von Hand gelöschte/bearbeitete Tage (Timewarp): zählen nicht mit */
  suppressedDates?: readonly string[];
}

/** Eintragstypen, die als lose Abwesenheit in die Liste kommen */
export type LooseEntryType = "VACATION" | "OVERTIME_REDUCTION" | "UNPAID_LEAVE";

export const LOOSE_ENTRY_TYPES: readonly LooseEntryType[] = [
  "VACATION",
  "OVERTIME_REDUCTION",
  "UNPAID_LEAVE",
];

export interface LooseEntryRow {
  dateKey: string;
  type: LooseEntryType;
  hours: number;
  /** EntrySource des Eintrags */
  source: string;
}

export interface BlockContext {
  /** 0 = Sonntag … 6 = Samstag, wie UserSettings.workDays */
  workDays: readonly number[];
  /** Offizielle und importierte Feiertage */
  holidays: ReadonlySet<string>;
  /** Tagessoll in Stunden */
  dailyHours: number;
  todayKey: string;
}

export interface BuildBlocksInput extends BlockContext {
  absences: readonly AbsenceRow[];
  looseEntries: readonly LooseEntryRow[];
}

/** Zählt der Tag als Abwesenheitstag: Arbeitstag und kein Feiertag. */
function isCountedDay(
  key: string,
  workDays: ReadonlySet<number>,
  holidays: ReadonlySet<string>,
): boolean {
  return workDays.has(weekdayOfKey(key)) && !holidays.has(key);
}

/** Abwesenheitstage von from bis to: Arbeitstage ohne Feiertage und ohne unterdrückte Tage. */
export function countAbsenceDays(
  from: string,
  to: string,
  halfDay: boolean,
  ctx: Pick<BlockContext, "workDays" | "holidays">,
  suppressedDates: readonly string[] = [],
): number {
  const workDays = new Set(ctx.workDays);
  const suppressed = new Set(suppressedDates);
  let count = 0;
  for (let key = from; key <= to; key = shiftDateKey(key, 1)) {
    if (isCountedDay(key, workDays, ctx.holidays) && !suppressed.has(key)) {
      count++;
    }
  }
  return halfDay ? count / 2 : count;
}

/** Zustand eines Blocks; „geplant“ heißt wie im Bericht: nach heute. */
export function blockState(
  from: string,
  to: string,
  cancelled: boolean,
  todayKey: string,
): AbsenceBlockState {
  if (cancelled) return "cancelled";
  if (from > todayKey) return "planned";
  if (to <= todayKey) return "taken";
  return "partial";
}

/** Herkunft eines losen Eintrags für die Liste. */
function looseSource(entrySource: string): AbsenceBlockSource {
  switch (entrySource) {
    case "TIMING_SYNC":
    case "FILE_IMPORT":
      return "TIMING";
    case "TIMEWARP":
      // Verwaist (Abwesenheit gelöscht) – Herkunft bleibt sichtbar
      return "TIMEWARP";
    default:
      return "MANUAL";
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Lose Einträge einer Herkunft und Art zu Blöcken: Ein Block läuft weiter,
 * solange zwischen zwei Tagen nur Nicht-Arbeitstage und Feiertage liegen.
 */
function groupLooseEntries(
  source: AbsenceBlockSource,
  kind: LooseEntryType,
  hoursByDate: Map<string, number>,
  ctx: BlockContext,
  workDays: ReadonlySet<number>,
): AbsenceBlock[] {
  const dates = [...hoursByDate.keys()].sort();
  const blocks: AbsenceBlock[] = [];
  let current: { from: string; to: string; days: number } | null = null;

  const flush = () => {
    if (!current) return;
    const halfDay = current.from === current.to && current.days === 0.5;
    blocks.push({
      id: null,
      source,
      kind,
      from: current.from,
      to: current.to,
      halfDay,
      status: "ACTIVE",
      state: blockState(current.from, current.to, false, ctx.todayKey),
      days: round2(current.days),
      deletable: false,
    });
  };

  for (const date of dates) {
    const hours = hoursByDate.get(date) ?? 0;
    const days = isCountedDay(date, workDays, ctx.holidays)
      ? hoursToAbsenceDays(hours, ctx.dailyHours)
      : 0;
    if (current && onlyFreeDaysBetween(current.to, date, ctx, workDays)) {
      current.to = date;
      current.days += days;
    } else {
      flush();
      current = { from: date, to: date, days };
    }
  }
  flush();
  return blocks;
}

/** Liegen zwischen a und b (exklusiv) nur Nicht-Arbeitstage und Feiertage? */
function onlyFreeDaysBetween(
  a: string,
  b: string,
  ctx: BlockContext,
  workDays: ReadonlySet<number>,
): boolean {
  for (let key = shiftDateKey(a, 1); key < b; key = shiftDateKey(key, 1)) {
    if (isCountedDay(key, workDays, ctx.holidays)) return false;
  }
  return true;
}

export function buildAbsenceBlocks(input: BuildBlocksInput): AbsenceBlock[] {
  const workDays = new Set(input.workDays);

  const fromAbsences = input.absences.map(
    (absence): AbsenceBlock => ({
      id: absence.id,
      source: absence.source,
      kind: absence.kind,
      from: absence.startDate,
      to: absence.endDate,
      halfDay: absence.halfDay,
      status: absence.status,
      state: blockState(
        absence.startDate,
        absence.endDate,
        absence.status === "CANCELLED",
        input.todayKey,
      ),
      days: countAbsenceDays(
        absence.startDate,
        absence.endDate,
        absence.halfDay,
        input,
        absence.suppressedDates,
      ),
      deletable: absence.source === "MANUAL",
    }),
  );

  // Stunden je Herkunft, Art und Tag: Timing teilt einen Tag teils in mehrere Einträge
  const groups = new Map<
    string,
    {
      source: AbsenceBlockSource;
      kind: LooseEntryType;
      hours: Map<string, number>;
    }
  >();
  for (const entry of input.looseEntries) {
    const source = looseSource(entry.source);
    const groupKey = `${source}|${entry.type}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { source, kind: entry.type, hours: new Map() };
      groups.set(groupKey, group);
    }
    group.hours.set(
      entry.dateKey,
      (group.hours.get(entry.dateKey) ?? 0) + entry.hours,
    );
  }

  const fromEntries = [...groups.values()].flatMap((group) =>
    groupLooseEntries(group.source, group.kind, group.hours, input, workDays),
  );

  const sourceOrder: Record<AbsenceBlockSource, number> = {
    TIMEWARP: 0,
    MANUAL: 1,
    TIMING: 2,
  };
  return [...fromAbsences, ...fromEntries].sort(
    (a, b) =>
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to) ||
      sourceOrder[a.source] - sourceOrder[b.source],
  );
}
