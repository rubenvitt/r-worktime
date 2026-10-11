// Abgleich der Tage (TimeEntries) mit den Timewarp-Abwesenheiten. Rein:
// rechnet nur aus dem aktuellen Stand, damit ein abgebrochener Lauf beim
// nächsten Mal von selbst heilt. Regeln: Spec „Abgleich“, Schritt 4.

import { berlinWallClock, planAbsenceRange } from "@/lib/absence-range";
import {
  type AbsenceEntryKind,
  type AbsenceKind,
  entryTypeForKind,
  writesToTiming,
} from "@/lib/absences/kinds";

/** Timewarp-Einträge beginnen um 08:00 Berliner Zeit (wie die Urlaube in Timing). */
export const TIMEWARP_START_HOUR = 8;

/**
 * Notiz an Einträgen, die der Abgleich in Timing anlegt. Nur ein Timing-
 * Eintrag mit dieser Notiz gilt als eigener (übernehmen, später löschen);
 * alle anderen werden höchstens verknüpft und nie gelöscht.
 */
export const TIMEWARP_NOTE = "Aus Timewarp";

export function isOwnTimingNote(notes: string | null | undefined): boolean {
  return typeof notes === "string" && notes.includes(TIMEWARP_NOTE);
}

/** Unter drei Vierteln des Tagessolls gilt ein eigener Eintrag als halber Tag. */
const HALF_DAY_THRESHOLD = 0.75;

export interface DayPlanAbsence {
  id: string;
  kind: AbsenceKind;
  /** "YYYY-MM-DD", beide inklusive */
  startDate: string;
  endDate: string;
  halfDay: boolean;
  status: "ACTIVE" | "CANCELLED";
  /** Von Hand gelöschte/bearbeitete Tage: weder anlegen noch verknüpfen */
  suppressedDates: readonly string[];
}

export interface DayPlanEntry {
  id: string;
  date: string;
  type: string;
  source: string;
  absenceId: string | null;
  externalId: string | null;
  /** Stunden */
  duration: number;
}

export interface DayPlanInput {
  /**
   * Abwesenheiten, deren Tage abgeglichen werden: die aus dem aktuellen Feed
   * und stornierte mit noch verknüpften Einträgen
   */
  absences: readonly DayPlanAbsence[];
  /**
   * Alle mit diesen Abwesenheiten verknüpften Einträge sowie die Einträge im
   * Zeitraum vom Typ HOLIDAY, VACATION, SICK, OVERTIME_REDUCTION und
   * UNPAID_LEAVE
   */
  entries: readonly DayPlanEntry[];
  /** 0 = Sonntag … 6 = Samstag */
  workDays: readonly number[];
  dailyHours: number;
  /** Offizielle Feiertage, Datum → Name */
  officialHolidays: Record<string, string>;
  /** Timing-Einträge möglich (writeToTiming, Projekt und Token vorhanden) */
  timingEnabled: boolean;
}

export interface DayRef {
  absenceId: string;
  kind: AbsenceKind;
  date: string;
}

export interface PlannedLink extends DayRef {
  entryId: string;
}

export interface PlannedCreate extends DayRef {
  entryType: AbsenceEntryKind;
  halfDay: boolean;
  hours: number;
  startTime: Date;
  endTime: Date;
  /** In Timing anlegen (bzw. vorhandenen Timing-Eintrag übernehmen) */
  toTiming: boolean;
  /** Ersetzt einen eben entfernten eigenen Eintrag (ganz ↔ halb) */
  replaces: string | null;
}

export interface PlannedRemove extends DayRef {
  entryId: string;
  /** Timing-ID; dann zuerst in Timing löschen */
  externalId: string | null;
  reason: "notPlanned" | "halfDayChanged" | "kindChanged" | "duplicate";
}

export interface PlannedUnlink extends DayRef {
  entryId: string;
}

export interface DayPlan {
  link: PlannedLink[];
  create: PlannedCreate[];
  /** Eigene Einträge (source TIMEWARP): in Timing und lokal löschen */
  remove: PlannedRemove[];
  /** Fremde Einträge: nur absenceId entfernen */
  unlink: PlannedUnlink[];
}

const OWN_SOURCE = "TIMEWARP";
/** Diese Herkünfte werden nie mit einer Abwesenheit verknüpft. */
const NEVER_LINK_SOURCES = new Set(["ADJUSTMENT", "HOLIDAY"]);
/** Abwesenheitstypen, die einen Tag belegen (wie im Dialog „Abwesenheit eintragen“) */
const OCCUPYING_TYPES = new Set([
  "VACATION",
  "SICK",
  "OVERTIME_REDUCTION",
  "UNPAID_LEAVE",
]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function timewarpDayHours(halfDay: boolean, dailyHours: number): number {
  return round2(halfDay ? dailyHours / 2 : dailyHours);
}

/** Beginn 08:00 Berliner Zeit, Ende = Beginn + Dauer (minutengenau). */
export function timewarpDayTimes(
  date: string,
  hours: number,
): { startTime: Date; endTime: Date } {
  const startTime = berlinWallClock(date, TIMEWARP_START_HOUR);
  return {
    startTime,
    endTime: new Date(startTime.getTime() + Math.round(hours * 60) * 60_000),
  };
}

export function isHalfDayEntry(duration: number, dailyHours: number): boolean {
  return duration < dailyHours * HALF_DAY_THRESHOLD;
}

/** Soll-Tage einer aktiven Abwesenheit: Arbeitstage ohne Feiertage und ohne unterdrückte Tage. */
function targetDates(
  absence: DayPlanAbsence,
  input: DayPlanInput,
  holidayEntries: DayPlanEntry[],
): string[] {
  if (absence.status !== "ACTIVE" || absence.startDate > absence.endDate) {
    return [];
  }
  const suppressed = new Set(absence.suppressedDates);
  const { days } = planAbsenceRange({
    from: absence.startDate,
    to: absence.endDate,
    halfDay: absence.halfDay,
    workDays: input.workDays,
    dailyHours: input.dailyHours,
    officialHolidays: input.officialHolidays,
    // Nur Feiertage: vorhandene Abwesenheits-Einträge entscheidet der Plan selbst
    existingEntries: holidayEntries.map((entry) => ({
      date: entry.date,
      type: entry.type,
    })),
  });
  return days.map((day) => day.date).filter((date) => !suppressed.has(date));
}

function compareAbsences(a: DayPlanAbsence, b: DayPlanAbsence): number {
  return a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id);
}

export function planDays(input: DayPlanInput): DayPlan {
  const plan: DayPlan = { link: [], create: [], remove: [], unlink: [] };
  const absences = [...input.absences].sort(compareAbsences);
  const absenceIds = new Set(absences.map((a) => a.id));
  const holidayEntries = input.entries.filter((e) => e.type === "HOLIDAY");

  const linkedByAbsence = new Map<string, DayPlanEntry[]>();
  for (const entry of input.entries) {
    if (entry.absenceId && absenceIds.has(entry.absenceId)) {
      const list = linkedByAbsence.get(entry.absenceId) ?? [];
      list.push(entry);
      linkedByAbsence.set(entry.absenceId, list);
    }
  }

  // Jeder Tag gehört höchstens einer Abwesenheit. Vorrang hat, wer an dem
  // Tag schon einen verknüpften Eintrag hat, danach die früher beginnende.
  const targets = new Map(
    absences.map((a) => [a.id, targetDates(a, input, holidayEntries)]),
  );
  const owner = new Map<string, string>();
  for (const absence of absences) {
    const wanted = new Set(targets.get(absence.id));
    for (const entry of linkedByAbsence.get(absence.id) ?? []) {
      if (wanted.has(entry.date) && !owner.has(entry.date)) {
        owner.set(entry.date, absence.id);
      }
    }
  }
  for (const absence of absences) {
    for (const date of targets.get(absence.id) ?? []) {
      if (!owner.has(date)) owner.set(date, absence.id);
    }
  }

  // Tage, die schon anderweitig belegt sind: Eintrag einer anderen (z. B.
  // im Dialog angelegten) Abwesenheit oder Krankheit. Dort wird weder
  // angelegt noch verknüpft – sonst entstünde der Tag doppelt.
  const occupiedDates = new Set(
    input.entries
      .filter(
        (entry) =>
          entry.source !== "ADJUSTMENT" &&
          OCCUPYING_TYPES.has(entry.type) &&
          ((entry.absenceId !== null && !absenceIds.has(entry.absenceId)) ||
            (entry.type === "SICK" && entry.absenceId === null)),
      )
      .map((entry) => entry.date),
  );

  // Freie Einträge (ohne Abwesenheit) je Tag und Typ, zum Verknüpfen
  const usedEntryIds = new Set<string>();
  const freeEntry = (date: string, type: string) =>
    input.entries.find(
      (entry) =>
        entry.date === date &&
        entry.type === type &&
        entry.absenceId === null &&
        !NEVER_LINK_SOURCES.has(entry.source) &&
        !usedEntryIds.has(entry.id),
    );

  for (const absence of absences) {
    const entryType = entryTypeForKind(absence.kind);
    const ref = (date: string): DayRef => ({
      absenceId: absence.id,
      kind: absence.kind,
      date,
    });
    const covered = new Set<string>();
    const replaced = new Map<string, string>();
    // Unterdrückte Tage einer aktiven Abwesenheit: Hände weg, auch von
    // dort noch verknüpften Einträgen
    const handsOff = new Set(
      absence.status === "ACTIVE" ? absence.suppressedDates : [],
    );

    const linked = [...(linkedByAbsence.get(absence.id) ?? [])].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        // Fremde Einträge vor eigenen behalten, dann stabil nach ID
        Number(a.source === OWN_SOURCE) - Number(b.source === OWN_SOURCE) ||
        a.id.localeCompare(b.id),
    );
    for (const entry of linked) {
      if (handsOff.has(entry.date)) continue;
      const own = entry.source === OWN_SOURCE;
      const isTarget = owner.get(entry.date) === absence.id;
      if (!isTarget || covered.has(entry.date)) {
        if (own) {
          plan.remove.push({
            ...ref(entry.date),
            entryId: entry.id,
            externalId: entry.externalId,
            reason: isTarget ? "duplicate" : "notPlanned",
          });
        } else {
          plan.unlink.push({ ...ref(entry.date), entryId: entry.id });
        }
        continue;
      }
      // Art in Timewarp geändert (z. B. Urlaub → Überstundenabbau): eigene
      // Einträge ersetzen, fremde lösen; der Tag läuft dann normal weiter
      const kindChanged = entry.type !== entryType;
      const halfDayChanged =
        own &&
        isHalfDayEntry(entry.duration, input.dailyHours) !== absence.halfDay;
      if (kindChanged && !own) {
        plan.unlink.push({ ...ref(entry.date), entryId: entry.id });
        continue;
      }
      if (kindChanged || halfDayChanged) {
        plan.remove.push({
          ...ref(entry.date),
          entryId: entry.id,
          externalId: entry.externalId,
          reason: kindChanged ? "kindChanged" : "halfDayChanged",
        });
        replaced.set(entry.date, entry.id);
        continue;
      }
      covered.add(entry.date);
    }

    for (const date of targets.get(absence.id) ?? []) {
      if (owner.get(date) !== absence.id || covered.has(date)) continue;
      if (occupiedDates.has(date)) continue;
      const free = freeEntry(date, entryType);
      if (free) {
        usedEntryIds.add(free.id);
        plan.link.push({ ...ref(date), entryId: free.id });
        continue;
      }
      const hours = timewarpDayHours(absence.halfDay, input.dailyHours);
      plan.create.push({
        ...ref(date),
        entryType,
        halfDay: absence.halfDay,
        hours,
        ...timewarpDayTimes(date, hours),
        toTiming: input.timingEnabled && writesToTiming(absence.kind),
        replaces: replaced.get(date) ?? null,
      });
    }
  }

  return plan;
}
