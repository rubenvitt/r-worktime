// Abwesenheiten & Urlaubskonto eines Kalenderjahrs (reine Funktionen, testbar).
//
// Regeln:
// - Tage werden über die date-Spalte zugeordnet ("YYYY-MM-DD", Berliner Kalendertag).
// - Mehrere Einträge eines Tags werden je Typ erst summiert, dann umgerechnet:
//   Tage = Stunden / Tagessoll, auf halbe Tage gerundet, mindestens ½, höchstens 1.
// - Gezählt wird nur an Arbeitstagen (UserSettings.workDays), wie im
//   Überstunden-Service. Abwesenheit an anderen Tagen erscheint im Kalender,
//   zählt aber 0 Tage.
// - Ein Tag hat höchstens einen Abwesenheitstag. Vorrang: Feiertag, dann
//   Krankheit (Krankheit im Urlaub verbraucht keinen Urlaub, § 9 BUrlG), dann Urlaub.
// - Geprüfte Tage mit dem Grund „Unbezahlter Urlaub“ zählen als eigene
//   Kategorie (ganzer Tag, nur an Arbeitstagen ohne erfasste Abwesenheit
//   und ohne Arbeitseinträge – der Grund bleibt stehen, wenn später doch
//   Arbeit nachgetragen wird).
//   Sie verringern den Urlaubsanspruch nicht. Andere Gründe werden ignoriert.
// - Urlaub bis einschließlich heute ist „genommen“, danach „geplant“.
// - Offizielle Feiertage (Feiertags-Dienst) zählen an Arbeitstagen als ganzer
//   Feiertag, auch ohne importierten HOLIDAY-Eintrag – wie im Saldo, der sie
//   ebenfalls aus dem Soll nimmt.
// - Abstimmung mit dem Saldo (year.ts › summarizeRange): gleicher Kalendertag,
//   gleiche Arbeitstage, an Feiertagen keine Gutschrift, höchstens ein Tag.
//   Der Saldo schreibt die Stunden gut (4 h Urlaub = 4 h), der Bericht zählt
//   Tage in halben Schritten (4 h = ½ Tag); 0-h-Einträge zählen in beiden nicht.
// - Kategorie aus Eintragstyp und Art der verknüpften Abwesenheit
//   (Absence.kind): VACATION-Einträge zu Sonderurlaub bzw. Bildungsurlaub
//   sind eigene Kategorien und belasten das Urlaubskonto nicht; VACATION
//   ohne verknüpfte Abwesenheit (Timing-Sync, Altbestand) belastet es wie
//   bisher. OVERTIME_REDUCTION ist „Überstundenabbau“, UNPAID_LEAVE
//   (unbezahlter Urlaub, Elternzeit, Mutterschutz, Sabbatical) zählt zu
//   „Unbezahlt“ wie die geprüften Tage.
// - Vorrang je Tag (höchstens ein Tag): Feiertag, Krankheit, Urlaub,
//   Sonderurlaub, Bildungsurlaub, Unbezahlt, Überstundenabbau.

import type { AbsenceKind } from "@/lib/absences/kinds";
import { weekdayOfKey } from "@/lib/dates";

export type AbsenceEntryType =
  | "VACATION"
  | "SICK"
  | "HOLIDAY"
  | "OVERTIME_REDUCTION"
  | "UNPAID_LEAVE";

export type AbsenceCategory =
  | "vacation"
  | "specialLeave"
  | "educationalLeave"
  | "overtimeReduction"
  | "sick"
  | "holiday"
  | "unpaid";

export const ABSENCE_CATEGORIES: readonly AbsenceCategory[] = [
  "vacation",
  "specialLeave",
  "educationalLeave",
  "overtimeReduction",
  "sick",
  "holiday",
  "unpaid",
];

export const ABSENCE_CATEGORY_LABELS: Record<AbsenceCategory, string> = {
  vacation: "Urlaub",
  specialLeave: "Sonderurlaub",
  educationalLeave: "Bildungsurlaub",
  overtimeReduction: "Überstundenabbau",
  sick: "Krankheit",
  holiday: "Feiertag",
  unpaid: "Unbezahlter Urlaub",
};

/** Kategorien, die im Urlaubskonto als eigene Zeilen erscheinen (ohne Belastung). */
export type NonCountingCategory =
  | "specialLeave"
  | "educationalLeave"
  | "overtimeReduction"
  | "unpaid";

export const NON_COUNTING_CATEGORIES: readonly NonCountingCategory[] = [
  "specialLeave",
  "educationalLeave",
  "overtimeReduction",
  "unpaid",
];

/** Fallback wie im Überstunden-Service, wenn Einstellungen unbrauchbar sind. */
const DEFAULT_DAILY_HOURS = 8;

export type CategoryValues = Record<AbsenceCategory, number>;

export interface AbsenceEntryInput {
  /** Kalendertag "YYYY-MM-DD" (date-Spalte) */
  dateKey: string;
  type: AbsenceEntryType;
  /** Dauer in Stunden */
  hours: number;
  /** Art der verknüpften Abwesenheit; fehlt bei Einträgen ohne absenceId */
  kind?: AbsenceKind | null;
}

export interface ReviewedDayInput {
  dateKey: string;
  reason: string | null;
}

export interface AbsenceSettingsInput {
  weeklyWorkHours: number;
  /** 0 = Sonntag … 6 = Samstag */
  workDays: number[];
  annualVacationDays: number;
}

export interface AbsenceReportInput {
  year: number;
  todayKey: string;
  settings: AbsenceSettingsInput;
  entries: AbsenceEntryInput[];
  reviewedDays: ReviewedDayInput[];
  /** Tage mit Arbeitseinträgen; dort zählt „Unbezahlter Urlaub“ nicht */
  workedDateKeys?: readonly string[];
  /** Offizielle Feiertage: Datum → Name */
  holidays?: Readonly<Record<string, string>>;
  /** Feiertags-Dienst nicht erreichbar: nur importierte Feiertage bekannt */
  holidayServiceUnavailable?: boolean;
}

export interface AbsenceDay {
  dateKey: string;
  isWorkDay: boolean;
  /** Liegt nach heute */
  isFuture: boolean;
  /** Erfasste Stunden je Kategorie (unbezahlt: 0, es gibt keinen Eintrag) */
  hours: CategoryValues;
  /** Gezählte Tage je Kategorie nach Vorrang und Umrechnung */
  days: CategoryValues;
  /** Kategorie für die Farbe im Kalender */
  primary: AbsenceCategory;
  /** Name des offiziellen Feiertags, falls bekannt */
  holidayName?: string;
  /** Feiertag mit importiertem HOLIDAY-Eintrag (nur bei Feiertagen gesetzt) */
  holidayImported?: boolean;
}

export interface AbsenceMonth {
  /** "YYYY-MM" */
  month: string;
  days: CategoryValues;
  hours: CategoryValues;
  /** Anteil von days.vacation, der nach heute liegt */
  plannedVacationDays: number;
}

export interface AccountLine {
  /** bis einschließlich heute */
  taken: number;
  /** nach heute */
  planned: number;
}

export interface VacationAccount {
  entitlement: number;
  /** Belastende Tage (Urlaub, Resturlaub, Urlaub ohne Abwesenheit) bis heute */
  taken: number;
  planned: number;
  /** Anspruch − genommen − geplant; kann negativ werden */
  remaining: number;
  /** Abwesenheiten, die den Anspruch nicht verringern */
  others: Record<NonCountingCategory, AccountLine>;
}

export interface AbsenceReport {
  year: number;
  todayKey: string;
  dailyTargetHours: number;
  workDays: number[];
  /** Nur Tage mit Abwesenheit, aufsteigend */
  days: AbsenceDay[];
  /** Immer 12 Monate */
  months: AbsenceMonth[];
  totals: { days: CategoryValues; hours: CategoryValues };
  account: VacationAccount;
  /** Tage mit erfasster Abwesenheit an Nicht-Arbeitstagen (nicht gezählt) */
  nonWorkDayAbsences: number;
  /** Feiertags-Dienst nicht erreichbar: nur importierte Feiertage bekannt */
  holidayServiceUnavailable: boolean;
}

export function emptyCategoryValues(): CategoryValues {
  return {
    vacation: 0,
    specialLeave: 0,
    educationalLeave: 0,
    overtimeReduction: 0,
    sick: 0,
    holiday: 0,
    unpaid: 0,
  };
}

const emptyValues = emptyCategoryValues;

/** Auf zwei Nachkommastellen, damit Fließkomma-Reste nicht in die Anzeige laufen. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Tagessoll = Wochenstunden / Anzahl Arbeitstage; Fallback 8 h. */
export function dailyTargetHours(
  weeklyWorkHours: number,
  workDays: readonly number[],
): number {
  if (
    !Number.isFinite(weeklyWorkHours) ||
    weeklyWorkHours <= 0 ||
    workDays.length === 0
  ) {
    return DEFAULT_DAILY_HOURS;
  }
  return weeklyWorkHours / workDays.length;
}

/**
 * Stunden → Abwesenheitstage in halben Tagen (höchstens 1).
 * Jede erfasste Abwesenheit zählt mindestens einen halben Tag.
 */
export function hoursToAbsenceDays(hours: number, dailyHours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  const target = dailyHours > 0 ? dailyHours : DEFAULT_DAILY_HOURS;
  const halves = Math.round((hours / target) * 2);
  return Math.min(1, Math.max(0.5, halves / 2));
}

/**
 * Abwesenheitstage eines Tags aus Krankheits- und Urlaubsstunden: je Typ auf
 * halbe Tage gerundet, Krankheit vor Urlaub, zusammen höchstens ein Tag.
 * Dieselbe Umrechnung nutzen Jahresübersicht und Prognose.
 */
export function absenceDayShare(
  sickHours: number,
  vacationHours: number,
  dailyHours: number,
): number {
  const sick = hoursToAbsenceDays(sickHours, dailyHours);
  const vacation = hoursToAbsenceDays(vacationHours, dailyHours);
  return sick + Math.min(vacation, 1 - sick);
}

/** Grund eines geprüften Tags ist „Unbezahlter Urlaub“ (Schreibweise egal). */
export function isUnpaidLeaveReason(
  reason: string | null | undefined,
): boolean {
  if (!reason) return false;
  return (
    reason.trim().replace(/\s+/g, " ").toLowerCase() === "unbezahlter urlaub"
  );
}

/** Kategorie eines Eintrags aus Typ und Art der verknüpften Abwesenheit. */
export function absenceCategoryOf(
  entry: Pick<AbsenceEntryInput, "type" | "kind">,
): AbsenceCategory | null {
  switch (entry.type) {
    case "HOLIDAY":
      return "holiday";
    case "SICK":
      return "sick";
    case "OVERTIME_REDUCTION":
      return "overtimeReduction";
    case "UNPAID_LEAVE":
      return "unpaid";
    case "VACATION":
      if (entry.kind === "SPECIAL_LEAVE") return "specialLeave";
      if (entry.kind === "EDUCATIONAL_LEAVE") return "educationalLeave";
      return "vacation";
    default:
      return null;
  }
}

/** Vorrang bei der Verteilung des einen Tages. */
const PRECEDENCE: readonly AbsenceCategory[] = [
  "holiday",
  "sick",
  "vacation",
  "specialLeave",
  "educationalLeave",
  "unpaid",
  "overtimeReduction",
];

function primaryOf(day: { hours: CategoryValues; days: CategoryValues }) {
  // Bevorzugt die Kategorie mit den meisten gezählten Tagen, sonst mit Stunden
  const ordered = PRECEDENCE;
  let best: AbsenceCategory = ordered[0];
  let bestScore = -1;
  for (const category of ordered) {
    const score = day.days[category] * 1000 + day.hours[category];
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

export function buildAbsenceReport(input: AbsenceReportInput): AbsenceReport {
  const { year, todayKey, settings } = input;
  const yearPrefix = `${String(year).padStart(4, "0")}-`;
  const dailyHours = dailyTargetHours(
    settings.weeklyWorkHours,
    settings.workDays,
  );
  const workDays = new Set(settings.workDays);

  // Stunden je Tag und Kategorie sammeln
  const hoursByDay = new Map<string, CategoryValues>();
  for (const entry of input.entries) {
    if (!entry.dateKey.startsWith(yearPrefix)) continue;
    if (!Number.isFinite(entry.hours) || entry.hours <= 0) continue;
    const category = absenceCategoryOf(entry);
    if (!category) continue;
    let values = hoursByDay.get(entry.dateKey);
    if (!values) {
      values = emptyValues();
      hoursByDay.set(entry.dateKey, values);
    }
    values[category] += entry.hours;
  }

  const officialHolidays = new Map(
    Object.entries(input.holidays ?? {}).filter(([key]) =>
      key.startsWith(yearPrefix),
    ),
  );

  const workedKeys = new Set(input.workedDateKeys ?? []);
  const unpaidKeys = new Set<string>();
  for (const reviewed of input.reviewedDays) {
    if (!reviewed.dateKey.startsWith(yearPrefix)) continue;
    if (!isUnpaidLeaveReason(reviewed.reason)) continue;
    if (hoursByDay.has(reviewed.dateKey)) continue;
    if (officialHolidays.has(reviewed.dateKey)) continue;
    if (workedKeys.has(reviewed.dateKey)) continue;
    if (!workDays.has(weekdayOfKey(reviewed.dateKey))) continue;
    unpaidKeys.add(reviewed.dateKey);
  }

  const days: AbsenceDay[] = [];
  let nonWorkDayAbsences = 0;

  for (const [dateKey, rawHours] of hoursByDay) {
    const hours = emptyValues();
    for (const category of ABSENCE_CATEGORIES) {
      hours[category] = round2(rawHours[category]);
    }
    const isWorkDay = workDays.has(weekdayOfKey(dateKey));
    const holidayName = officialHolidays.get(dateKey);
    const counted = emptyValues();
    if (isWorkDay) {
      let capacity = 1;
      for (const category of PRECEDENCE) {
        // Offizieller Feiertag: ganzer Tag, unabhängig von erfassten Stunden
        const categoryDays =
          category === "holiday" && holidayName !== undefined
            ? 1
            : hoursToAbsenceDays(hours[category], dailyHours);
        const value = Math.min(categoryDays, capacity);
        counted[category] = value;
        capacity -= value;
      }
    } else {
      nonWorkDayAbsences++;
    }
    const isHoliday = hours.holiday > 0 || holidayName !== undefined;
    days.push({
      dateKey,
      isWorkDay,
      isFuture: dateKey > todayKey,
      hours,
      days: counted,
      primary: primaryOf({ hours, days: counted }),
      ...(holidayName !== undefined ? { holidayName } : {}),
      ...(isHoliday ? { holidayImported: hours.holiday > 0 } : {}),
    });
  }

  // Offizielle Feiertage ohne jeden Eintrag (nur an Arbeitstagen sichtbar)
  for (const [dateKey, holidayName] of officialHolidays) {
    if (!workDays.has(weekdayOfKey(dateKey))) continue;
    if (hoursByDay.has(dateKey)) continue;
    const counted = emptyValues();
    counted.holiday = 1;
    days.push({
      dateKey,
      isWorkDay: true,
      isFuture: dateKey > todayKey,
      hours: emptyValues(),
      days: counted,
      primary: "holiday",
      holidayName,
      holidayImported: false,
    });
  }

  for (const dateKey of unpaidKeys) {
    const counted = emptyValues();
    counted.unpaid = 1;
    days.push({
      dateKey,
      isWorkDay: true,
      isFuture: dateKey > todayKey,
      hours: emptyValues(),
      days: counted,
      primary: "unpaid",
    });
  }

  days.sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));

  const months: AbsenceMonth[] = Array.from({ length: 12 }, (_, index) => ({
    month: `${yearPrefix}${String(index + 1).padStart(2, "0")}`,
    days: emptyValues(),
    hours: emptyValues(),
    plannedVacationDays: 0,
  }));
  const totals = { days: emptyValues(), hours: emptyValues() };
  let taken = 0;
  let planned = 0;
  const others = Object.fromEntries(
    NON_COUNTING_CATEGORIES.map((category) => [
      category,
      { taken: 0, planned: 0 },
    ]),
  ) as Record<NonCountingCategory, AccountLine>;

  for (const day of days) {
    const month = months[Number(day.dateKey.slice(5, 7)) - 1];
    for (const category of ABSENCE_CATEGORIES) {
      month.days[category] += day.days[category];
      month.hours[category] = round2(
        month.hours[category] + day.hours[category],
      );
      totals.days[category] += day.days[category];
      totals.hours[category] = round2(
        totals.hours[category] + day.hours[category],
      );
    }
    if (day.isFuture) {
      month.plannedVacationDays += day.days.vacation;
      planned += day.days.vacation;
    } else {
      taken += day.days.vacation;
    }
    for (const category of NON_COUNTING_CATEGORIES) {
      others[category][day.isFuture ? "planned" : "taken"] +=
        day.days[category];
    }
  }

  const entitlement = Number.isFinite(settings.annualVacationDays)
    ? settings.annualVacationDays
    : 0;

  return {
    year,
    todayKey,
    dailyTargetHours: round2(dailyHours),
    workDays: [...settings.workDays].sort((a, b) => a - b),
    days,
    months,
    totals,
    account: {
      entitlement,
      taken,
      planned,
      remaining: entitlement - taken - planned,
      others,
    },
    nonWorkDayAbsences,
    holidayServiceUnavailable: input.holidayServiceUnavailable ?? false,
  };
}
