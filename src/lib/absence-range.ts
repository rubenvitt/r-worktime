// Abwesenheit für einen Zeitraum: welche Tage bekommen einen Eintrag, welche
// werden übersprungen. Reine Kalenderrechnung auf Berliner Datums-Keys, die
// Route liefert Einstellungen, Feiertage und vorhandene Einträge.

import {
  BERLIN_TIME_ZONE,
  berlinDayStart,
  isDateKey,
  shiftDateKey,
  weekdayOfKey,
} from "@/lib/dates";

export type AbsenceRangeType = "VACATION" | "SICK";

/** Höchstens ein Jahr inklusive Schalttag */
export const MAX_ABSENCE_RANGE_DAYS = 366;

/** Erlaubte Jahre, wie bei den Berichten */
export const MIN_ABSENCE_YEAR = 2000;
export const MAX_ABSENCE_YEAR = 2100;

/** Abwesenheiten beginnen wie im Timing-Import um 09:00 Berliner Zeit. */
export const ABSENCE_START_HOUR = 9;

/** Bezeichnung wie im Timing-Import („Urlaub“, „Krankheit“). */
export const ABSENCE_TITLE: Record<AbsenceRangeType, string> = {
  VACATION: "Urlaub",
  SICK: "Krankheit",
};

/** Vorhandene Einträge dieser Typen belegen einen Tag schon („existing“). */
const OCCUPYING_TITLE: Readonly<Record<string, string>> = {
  ...ABSENCE_TITLE,
  OVERTIME_REDUCTION: "Überstundenabbau",
  UNPAID_LEAVE: "Unbezahlter Urlaub",
};

/** Eintragstypen, die das Abfragen vorhandener Tage braucht (plus HOLIDAY). */
export const OCCUPYING_ENTRY_TYPES = [
  "VACATION",
  "SICK",
  "OVERTIME_REDUCTION",
  "UNPAID_LEAVE",
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

const wallClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BERLIN_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Abstand Berliner Ortszeit zu UTC in Millisekunden zum Zeitpunkt instant. */
function berlinOffsetMs(instant: number): number {
  const parts = wallClockFormatter.formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallClock = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return wallClock - Math.floor(instant / 1000) * 1000;
}

/** Zeitpunkt einer Berliner Uhrzeit an einem Kalendertag, z. B. 09:00 → 07:00Z im Sommer. */
export function berlinWallClock(key: string, hour: number, minute = 0): Date {
  const day = berlinDayStart(key);
  const guess = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    hour,
    minute,
  );
  // Zweiter Schritt korrigiert den Fall, dass zwischen Schätzung und Ergebnis
  // die Zeitumstellung liegt
  const first = guess - berlinOffsetMs(guess);
  return new Date(guess - berlinOffsetMs(first));
}

/** Anzahl Kalendertage von from bis to, beide inklusive. */
export function countDaysInclusive(from: string, to: string): number {
  return (
    Math.round(
      (berlinDayStart(to).getTime() - berlinDayStart(from).getTime()) /
        MS_PER_DAY,
    ) + 1
  );
}

/** Fehlermeldung für einen ungültigen Zeitraum, sonst null. */
export function validateAbsenceRange(range: {
  from: string;
  to: string;
  halfDay: boolean;
}): string | null {
  if (!isDateKey(range.from) || !isDateKey(range.to)) {
    return "Ungültiges Datum (JJJJ-MM-TT erwartet)";
  }
  if (
    range.from < `${MIN_ABSENCE_YEAR}-01-01` ||
    range.to > `${MAX_ABSENCE_YEAR}-12-31`
  ) {
    return `Das Datum muss zwischen ${MIN_ABSENCE_YEAR} und ${MAX_ABSENCE_YEAR} liegen.`;
  }
  if (range.from > range.to) {
    return "Der Beginn muss vor dem Ende liegen.";
  }
  if (countDaysInclusive(range.from, range.to) > MAX_ABSENCE_RANGE_DAYS) {
    return `Der Zeitraum darf höchstens ${MAX_ABSENCE_RANGE_DAYS} Tage umfassen.`;
  }
  if (range.halfDay && range.from !== range.to) {
    return "Ein halber Tag geht nur für einen einzelnen Tag.";
  }
  return null;
}

/** Vorhandener Eintrag im Zeitraum (nur Datum und Art werden gebraucht). */
export interface ExistingDayEntry {
  date: string;
  type: string;
  description?: string | null;
}

export interface AbsencePlanInput {
  from: string;
  to: string;
  halfDay: boolean;
  /** 0 = Sonntag … 6 = Samstag, wie UserSettings.workDays */
  workDays: readonly number[];
  /** Tagessoll in Stunden */
  dailyHours: number;
  /** Offizielle Feiertage, Datum → Name */
  officialHolidays: Record<string, string>;
  /**
   * Einträge im Zeitraum; HOLIDAY, VACATION, SICK, OVERTIME_REDUCTION und
   * UNPAID_LEAVE führen zum Überspringen
   */
  existingEntries: readonly ExistingDayEntry[];
}

export interface PlannedAbsenceDay {
  date: string;
  hours: number;
  startTime: Date;
  endTime: Date;
}

export type AbsenceSkipReason = "holiday" | "existing";

export interface SkippedAbsenceDay {
  date: string;
  reason: AbsenceSkipReason;
  /** Name des Feiertags bzw. Art der vorhandenen Abwesenheit */
  label: string;
}

export interface AbsencePlan {
  days: PlannedAbsenceDay[];
  /** Arbeitstage, die übersprungen werden (Feiertag, schon eingetragen) */
  skipped: SkippedAbsenceDay[];
  /** Tage im Zeitraum, die laut Einstellungen keine Arbeitstage sind */
  nonWorkDays: number;
  totalHours: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function planAbsenceRange(input: AbsencePlanInput): AbsencePlan {
  const workDays = new Set(input.workDays);
  const hours = round2(input.halfDay ? input.dailyHours / 2 : input.dailyHours);

  const importedHolidays = new Map<string, string>();
  const existingAbsences = new Map<string, string>();
  for (const entry of input.existingEntries) {
    if (entry.type === "HOLIDAY" && !importedHolidays.has(entry.date)) {
      importedHolidays.set(entry.date, entry.description?.trim() || "Feiertag");
    } else if (
      OCCUPYING_TITLE[entry.type] !== undefined &&
      !existingAbsences.has(entry.date)
    ) {
      existingAbsences.set(entry.date, OCCUPYING_TITLE[entry.type]);
    }
  }

  const days: PlannedAbsenceDay[] = [];
  const skipped: SkippedAbsenceDay[] = [];
  let nonWorkDays = 0;

  for (let key = input.from; key <= input.to; key = shiftDateKey(key, 1)) {
    if (!workDays.has(weekdayOfKey(key))) {
      nonWorkDays++;
      continue;
    }
    const holiday = input.officialHolidays[key] ?? importedHolidays.get(key);
    if (holiday) {
      skipped.push({ date: key, reason: "holiday", label: holiday });
      continue;
    }
    const existing = existingAbsences.get(key);
    if (existing) {
      skipped.push({ date: key, reason: "existing", label: existing });
      continue;
    }
    const startTime = berlinWallClock(key, ABSENCE_START_HOUR);
    days.push({
      date: key,
      hours,
      startTime,
      // Minutengenau wie der Eintragsdialog
      endTime: new Date(
        startTime.getTime() + Math.round(hours * 60) * (MS_PER_HOUR / 60),
      ),
    });
  }

  return {
    days,
    skipped,
    nonWorkDays,
    totalHours: round2(days.length * hours),
  };
}

/** Antwort von POST /api/time-entries/absences */
export interface AbsenceRangeResponse {
  dryRun: boolean;
  /** Angelegte (bei dryRun: anzulegende) Tage */
  created: number;
  /** Angelegte manuelle Abwesenheit (nur Urlaub, nicht bei dryRun), sonst null */
  absenceId: string | null;
  days: { date: string; hours: number }[];
  skipped: SkippedAbsenceDay[];
  nonWorkDays: number;
  totalHours: number;
  dailyHours: number;
  /** Jahre ohne Antwort des Feiertags-Dienstes: dort zählen nur importierte Feiertage */
  holidayServiceUnavailableYears: number[];
}

/** Beschreibung wie im Timing-Import: „Urlaub“ bzw. „Urlaub - Notiz“. */
export function absenceDescription(
  type: AbsenceRangeType,
  note?: string | null,
): string {
  const trimmed = note?.trim();
  return trimmed ? `${ABSENCE_TITLE[type]} - ${trimmed}` : ABSENCE_TITLE[type];
}

/** Abwesenheit (Absence-Zeile), die der Dialog zu seinen Einträgen anlegt. */
export interface ManualAbsenceData {
  source: "MANUAL";
  kind: "VACATION";
  /** Kalendertage "YYYY-MM-DD", beide inklusive */
  startDate: string;
  endDate: string;
  halfDay: boolean;
  status: "ACTIVE";
}

/**
 * Abwesenheit zum Dialog: Urlaub bekommt eine manuelle Abwesenheit über den
 * angefragten Zeitraum, mit der die angelegten Tage verknüpft werden – so lässt
 * sich der Block später als Ganzes löschen (DELETE /api/absences/[id]).
 *
 * Krankheit bekommt bewusst keine: SICK ist keine Abwesenheitsart
 * (AbsenceKind), Krankheitstage bleiben einzelne Einträge wie bisher.
 * Ohne angelegte Tage (alles übersprungen) entsteht ebenfalls keine.
 */
export function manualAbsenceFor(
  type: AbsenceRangeType,
  range: { from: string; to: string; halfDay: boolean },
  createdDays: number,
): ManualAbsenceData | null {
  if (type !== "VACATION" || createdDays <= 0) return null;
  return {
    source: "MANUAL",
    kind: "VACATION",
    startDate: range.from,
    endDate: range.to,
    halfDay: range.halfDay,
    status: "ACTIVE",
  };
}
