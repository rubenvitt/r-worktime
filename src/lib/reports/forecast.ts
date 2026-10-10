// Prognose für die kommenden Monate (reine Funktionen, testbar).
//
// Je Monat:
// - Soll = verfügbare Arbeitstage × Tagessoll; verfügbar = konfigurierte
//   Arbeitstage − Feiertage − geplanter Urlaub/Krank.
// - Erwartetes Ist = Ø Ist je verfügbarem Arbeitstag aus den letzten N
//   abgeschlossenen Monaten × verfügbare Arbeitstage.
// - Erwartet abrechenbar = historische Quote abrechenbar / gesamt × erwartetes
//   Ist (dieselbe Definition wie im Abrechnungsbericht; Stunden wie überall
//   hier je Eintrag auf Viertelstunden gerundet).
// - Der Saldo startet beim aktuellen Saldo. Darin steckt das Soll von heute,
//   aber nur die bisher erfasste Arbeit. Ist heute ein verfügbarer Arbeitstag,
//   kommt deshalb der Rest von heute dazu (Ø je Tag − bisher erfasst, kein
//   weiteres Soll); die übrigen Tage prognostiziert die Rechnung ab morgen.
// - Geplanter Urlaub/Krank wird wie im Abwesenheiten-Bericht in Tage
//   umgerechnet (je Typ auf halbe Tage, Krankheit vor Urlaub, höchstens 1).
//
// Erfahrungswerte nur aus echter Arbeit: Anfangssaldo, Feiertags-Einträge und
// Auffüllung (synthetische Uhrzeiten, Soll-Werte) zählen nicht. Tage, die
// nur aufgefüllt wurden, fallen auch aus den verfügbaren Tagen der Basis.

import {
  berlinTodayKey,
  monthRange,
  shiftDateKey,
  shiftMonthKey,
  weekdayOfKey,
} from "@/lib/dates";
import { absenceDayShare } from "@/lib/reports/absences";
import {
  billableShare,
  classifyBillingStatus,
} from "@/lib/reports/billing-status";
import {
  dateKeysBetween,
  isAbsence,
  isRealWork,
  isWorkEntry,
  type RangeSummary,
  type ReportEntry,
  roundToQuarterHour,
  summarizeRange,
  type WorkSchedule,
} from "@/lib/reports/year";

export const FORECAST_HORIZONS = [3, 6, 12] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];
export const DEFAULT_FORECAST_HORIZON: ForecastHorizon = 6;

export const BASE_MONTH_OPTIONS = [3, 6, 12] as const;
export type BaseMonthCount = (typeof BASE_MONTH_OPTIONS)[number];
export const DEFAULT_BASE_MONTHS: BaseMonthCount = 6;

export function isForecastHorizon(value: number): value is ForecastHorizon {
  return (FORECAST_HORIZONS as readonly number[]).includes(value);
}

export function isBaseMonthCount(value: number): value is BaseMonthCount {
  return (BASE_MONTH_OPTIONS as readonly number[]).includes(value);
}

/**
 * Letzter Prognosemonat: Dezember des laufenden Jahres plus `horizon` Monate.
 * So verlängert jeder Horizont den Zeitraum – auch früh im Jahr.
 */
export function forecastEndMonth(todayKey: string, horizon: number): string {
  return shiftMonthKey(`${todayKey.slice(0, 4)}-12`, horizon);
}

/** Laufender Monat bis einschließlich `forecastEndMonth`. */
export function forecastMonthKeys(todayKey: string, horizon: number): string[] {
  const end = forecastEndMonth(todayKey, horizon);
  const months: string[] = [];
  for (
    let month = todayKey.slice(0, 7);
    month <= end;
    month = shiftMonthKey(month, 1)
  ) {
    months.push(month);
  }
  return months;
}

/** Erster Tag, den die Prognose braucht (Beginn der Basis-Monate). */
export function baselineStartKey(todayKey: string, baseMonths: number): string {
  return `${shiftMonthKey(todayKey.slice(0, 7), -baseMonths)}-01`;
}

// ---------------------------------------------------------------------------
// Basis aus der Vergangenheit

export interface BaseMonth {
  month: string;
  from: string;
  to: string;
  /** Echte Arbeit (WORK/OVERTIME ohne Auffüllung), auf Viertelstunden gerundet */
  workHours: number;
  availableDays: number;
  hoursPerDay: number | null;
  workDays: number;
  holidayDays: number;
  absenceDays: number;
  /** Arbeitstage, an denen nur aufgefüllte Einträge stehen */
  bulkFillDays: number;
  billableHours: number;
  nonBillableHours: number;
  unknownBillingHours: number;
}

export interface Baseline {
  /** Angefragtes Fenster: die letzten N abgeschlossenen Monate */
  consideredMonths: string[];
  /** Davon Monate mit Daten */
  months: BaseMonth[];
  /** Gepoolt: Σ Arbeit / Σ verfügbare Tage */
  hoursPerDay: number | null;
  /** abrechenbar / gesamt; null, wenn kein Eintrag einen Status hat */
  billableQuote: number | null;
  billableHours: number;
  nonBillableHours: number;
  unknownBillingHours: number;
}

export interface BaselineInput {
  todayKey: string;
  baseMonths: number;
  entries: readonly ReportEntry[];
  schedule: WorkSchedule;
  /** Alle Feiertage (offiziell und importiert) */
  holidayKeys: ReadonlySet<string>;
  /** Erster gezählter Tag; null = ab Monatsbeginn */
  trackingStart: string | null;
}

function summarizeBaseMonth(
  month: string,
  input: BaselineInput,
): BaseMonth | null {
  const { firstKey, lastKey } = monthRange(month);
  const from =
    input.trackingStart && input.trackingStart > firstKey
      ? input.trackingStart
      : firstKey;
  if (from > lastKey) return null;

  const realWorkDays = new Set<string>();
  const bulkFillDays = new Set<string>();
  const absenceDays = new Set<string>();
  let workHours = 0;
  let billableHours = 0;
  let nonBillableHours = 0;
  let unknownBillingHours = 0;

  for (const entry of input.entries) {
    if (entry.date < from || entry.date > lastKey) continue;
    if (isAbsence(entry)) {
      // 0-h-Einträge sind keine Abwesenheit (wie im Saldo)
      if (entry.hours > 0) absenceDays.add(entry.date);
    } else if (isRealWork(entry)) {
      realWorkDays.add(entry.date);
      const hours = roundToQuarterHour(entry.hours);
      workHours += hours;
      const billingClass = classifyBillingStatus(entry.billingStatus);
      if (billingClass === "billable") billableHours += hours;
      else if (billingClass === "nonBillable") nonBillableHours += hours;
      else unknownBillingHours += hours;
    } else if (entry.source === "BULK_FILL") {
      bulkFillDays.add(entry.date);
    }
  }
  if (workHours <= 0) return null;

  let workDays = 0;
  let holidayDays = 0;
  let absenceCount = 0;
  let bulkOnly = 0;
  let availableDays = 0;
  for (const key of dateKeysBetween(from, lastKey)) {
    if (!input.schedule.workDays.includes(weekdayOfKey(key))) continue;
    workDays++;
    if (input.holidayKeys.has(key)) holidayDays++;
    else if (absenceDays.has(key)) absenceCount++;
    else if (bulkFillDays.has(key) && !realWorkDays.has(key)) bulkOnly++;
    else availableDays++;
  }

  return {
    month,
    from,
    to: lastKey,
    workHours,
    availableDays,
    hoursPerDay: availableDays > 0 ? workHours / availableDays : null,
    workDays,
    holidayDays,
    absenceDays: absenceCount,
    bulkFillDays: bulkOnly,
    billableHours,
    nonBillableHours,
    unknownBillingHours,
  };
}

export function computeBaseline(input: BaselineInput): Baseline {
  const current = input.todayKey.slice(0, 7);
  const consideredMonths = Array.from({ length: input.baseMonths }, (_, i) =>
    shiftMonthKey(current, i - input.baseMonths),
  );
  const months = consideredMonths
    .map((month) => summarizeBaseMonth(month, input))
    .filter((m): m is BaseMonth => m !== null);

  const totalHours = months.reduce((sum, m) => sum + m.workHours, 0);
  const totalDays = months.reduce((sum, m) => sum + m.availableDays, 0);
  const billableHours = months.reduce((sum, m) => sum + m.billableHours, 0);
  const nonBillableHours = months.reduce(
    (sum, m) => sum + m.nonBillableHours,
    0,
  );
  const unknownBillingHours = months.reduce(
    (sum, m) => sum + m.unknownBillingHours,
    0,
  );

  return {
    consideredMonths,
    months,
    hoursPerDay: totalDays > 0 ? totalHours / totalDays : null,
    billableQuote:
      billableHours > 0 || nonBillableHours > 0
        ? billableShare(
            billableHours,
            billableHours + nonBillableHours + unknownBillingHours,
          )
        : null,
    billableHours,
    nonBillableHours,
    unknownBillingHours,
  };
}

// ---------------------------------------------------------------------------
// Prognose

export interface ForecastToDate {
  from: string;
  to: string;
  actualHours: number;
  targetHours: number;
  deltaHours: number;
  billableHours: number;
}

export interface ForecastMonth {
  month: string;
  kind: "current" | "future";
  /** Prognostizierter Zeitraum; null, wenn im laufenden Monat nichts mehr übrig ist */
  from: string | null;
  to: string | null;
  workDays: number;
  holidayDays: number;
  /** Feiertage auf Arbeitstagen, "YYYY-MM-DD" */
  holidays: string[];
  /** Geplanter Urlaub/Krank an Soll-Tagen; halbe Tage anteilig */
  absenceDays: number;
  availableDays: number;
  targetHours: number;
  expectedHours: number;
  expectedBillableHours: number | null;
  deltaHours: number;
  /** Saldo am Monatsende */
  balanceHours: number;
  /**
   * Nur im laufenden Monat: erwartete Arbeit für den Rest von heute (in
   * `expectedHours` und `deltaHours` enthalten; das Soll von heute steckt
   * schon im aktuellen Saldo). Sonst 0.
   */
  todayRemainingHours: number;
  /** Nur im laufenden Monat: bereits erfasst bis heute */
  toDate: ForecastToDate | null;
}

export interface Forecast {
  todayKey: string;
  horizon: number;
  endMonth: string;
  dailyTargetHours: number;
  baseline: Baseline;
  /** Verwendeter Ø je verfügbarem Tag (Basis oder Tagessoll als Rückfall) */
  hoursPerDay: number;
  usedFallback: boolean;
  billableQuote: number | null;
  startBalance: number;
  endBalance: number;
  months: ForecastMonth[];
  totals: {
    availableDays: number;
    holidayDays: number;
    absenceDays: number;
    targetHours: number;
    expectedHours: number;
    expectedBillableHours: number | null;
    deltaHours: number;
  };
}

export interface ForecastInput {
  todayKey?: string;
  horizon: number;
  baseMonths: number;
  /** Einträge ab Beginn der Basis bis Ende des Horizonts (ohne Anfangssaldo) */
  entries: readonly ReportEntry[];
  schedule: WorkSchedule;
  /** Alle Feiertage (offiziell und importiert) – wie im Saldo */
  holidayKeys: ReadonlySet<string>;
  trackingStart: string | null;
  /** Aktueller Saldo (wie /overtime), inklusive heute */
  currentBalance: number;
}

function toDateSummary(
  summary: RangeSummary,
  from: string,
  to: string,
): ForecastToDate {
  return {
    from,
    to,
    actualHours: summary.actualHours,
    targetHours: summary.targetHours,
    deltaHours: summary.actualHours - summary.targetHours,
    billableHours: summary.billableHours,
  };
}

export function buildForecast(input: ForecastInput): Forecast {
  const todayKey = input.todayKey ?? berlinTodayKey();
  const { schedule, holidayKeys } = input;
  const baseline = computeBaseline({
    todayKey,
    baseMonths: input.baseMonths,
    entries: input.entries,
    schedule,
    holidayKeys,
    trackingStart: input.trackingStart,
  });
  const usedFallback = baseline.hoursPerDay === null;
  const hoursPerDay = baseline.hoursPerDay ?? schedule.dailyHours;
  const quote = baseline.billableQuote;

  // Geplante Abwesenheiten liegen nach heute. Umrechnung wie im
  // Abwesenheiten-Bericht: je Typ Stunden / Tagessoll auf halbe Tage
  // (mindestens ½), Krankheit vor Urlaub, zusammen höchstens ein Tag.
  const plannedHours = new Map<string, { sick: number; vacation: number }>();
  for (const entry of input.entries) {
    if (!isAbsence(entry) || entry.date <= todayKey || !(entry.hours > 0))
      continue;
    const hours = plannedHours.get(entry.date) ?? { sick: 0, vacation: 0 };
    if (entry.type === "SICK") hours.sick += entry.hours;
    else hours.vacation += entry.hours;
    plannedHours.set(entry.date, hours);
  }
  const plannedShare = (key: string): number => {
    const hours = plannedHours.get(key);
    if (!hours) return 0;
    return absenceDayShare(hours.sick, hours.vacation, schedule.dailyHours);
  };

  // Rest von heute: nur an einem verfügbaren Arbeitstag (kein Feiertag,
  // keine Abwesenheit). Arbeit zählt wie im Saldo, je Eintrag gerundet.
  let todayWork = 0;
  let todayAbsent = false;
  for (const entry of input.entries) {
    if (entry.date !== todayKey) continue;
    if (isAbsence(entry)) todayAbsent ||= entry.hours > 0;
    else if (isWorkEntry(entry)) todayWork += roundToQuarterHour(entry.hours);
  }
  const todayAvailable =
    schedule.workDays.includes(weekdayOfKey(todayKey)) &&
    !holidayKeys.has(todayKey) &&
    !todayAbsent;
  const todayRemaining = todayAvailable
    ? Math.max(0, hoursPerDay - todayWork)
    : 0;

  const tomorrow = shiftDateKey(todayKey, 1);
  let balance = input.currentBalance;
  const months: ForecastMonth[] = forecastMonthKeys(
    todayKey,
    input.horizon,
  ).map((month) => {
    const { firstKey, lastKey } = monthRange(month);
    const isCurrent = firstKey <= todayKey;
    const from = isCurrent ? tomorrow : firstKey;
    const hasDays = from <= lastKey;

    let workDays = 0;
    let absenceDays = 0;
    const holidays: string[] = [];
    if (hasDays) {
      for (const key of dateKeysBetween(from, lastKey)) {
        if (!schedule.workDays.includes(weekdayOfKey(key))) continue;
        workDays++;
        if (holidayKeys.has(key)) holidays.push(key);
        else absenceDays += plannedShare(key);
      }
    }
    const availableDays = workDays - holidays.length - absenceDays;
    const todayRemainingHours = isCurrent ? todayRemaining : 0;
    const targetHours = availableDays * schedule.dailyHours;
    const expectedHours = availableDays * hoursPerDay + todayRemainingHours;
    const deltaHours = expectedHours - targetHours;
    balance += deltaHours;

    let toDate: ForecastToDate | null = null;
    if (isCurrent) {
      const start =
        input.trackingStart && input.trackingStart > firstKey
          ? input.trackingStart
          : firstKey;
      if (start <= todayKey) {
        toDate = toDateSummary(
          summarizeRange(input.entries, {
            from: start,
            to: todayKey,
            schedule,
            holidayKeys,
          }),
          start,
          todayKey,
        );
      }
    }

    return {
      month,
      kind: isCurrent ? "current" : "future",
      from: hasDays ? from : null,
      to: hasDays ? lastKey : null,
      workDays,
      holidayDays: holidays.length,
      holidays,
      absenceDays,
      availableDays,
      targetHours,
      expectedHours,
      expectedBillableHours: quote === null ? null : expectedHours * quote,
      deltaHours,
      balanceHours: balance,
      todayRemainingHours,
      toDate,
    };
  });

  const sum = (pick: (m: ForecastMonth) => number) =>
    months.reduce((total, m) => total + pick(m), 0);

  return {
    todayKey,
    horizon: input.horizon,
    endMonth: forecastEndMonth(todayKey, input.horizon),
    dailyTargetHours: schedule.dailyHours,
    baseline,
    hoursPerDay,
    usedFallback,
    billableQuote: quote,
    startBalance: input.currentBalance,
    endBalance: balance,
    months,
    totals: {
      availableDays: sum((m) => m.availableDays),
      holidayDays: sum((m) => m.holidayDays),
      absenceDays: sum((m) => m.absenceDays),
      targetHours: sum((m) => m.targetHours),
      expectedHours: sum((m) => m.expectedHours),
      expectedBillableHours:
        quote === null ? null : sum((m) => m.expectedBillableHours ?? 0),
      deltaHours: sum((m) => m.deltaHours),
    },
  };
}
