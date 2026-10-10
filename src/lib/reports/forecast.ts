// Prognose für die kommenden Monate (reine Funktionen, testbar).
//
// Je Monat:
// - Soll = verfügbare Arbeitstage × Tagessoll; verfügbar = konfigurierte
//   Arbeitstage − Feiertage − geplanter Urlaub/Krank.
// - Erwartetes Ist = Ø Ist je verfügbarem Arbeitstag aus den letzten N
//   abgeschlossenen Monaten × verfügbare Arbeitstage.
// - Erwartet abrechenbar = historische Quote abrechenbar / (abrechenbar +
//   nicht abrechenbar) × erwartetes Ist; Einträge ohne Status bleiben außen vor.
// - Der Saldo startet beim aktuellen Saldo. Der zählt den heutigen Tag
//   bereits mit, deshalb beginnt die Prognose im laufenden Monat morgen.
//
// Erfahrungswerte nur aus echter Arbeit: Anfangssaldo, Feiertags-Einträge und
// Massen-Auffüllung (synthetische Uhrzeiten, Soll-Werte) zählen nicht. Tage, die
// nur aufgefüllt wurden, fallen auch aus den verfügbaren Tagen der Basis.

import {
  berlinTodayKey,
  monthRange,
  shiftDateKey,
  shiftMonthKey,
  weekdayOfKey,
} from "@/lib/dates";
import { classifyBillingStatus } from "@/lib/reports/billing-status";
import {
  dateKeysBetween,
  isAbsence,
  isRealWork,
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
      absenceDays.add(entry.date);
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
  const classified = billableHours + nonBillableHours;

  return {
    consideredMonths,
    months,
    hoursPerDay: totalDays > 0 ? totalHours / totalDays : null,
    billableQuote: classified > 0 ? billableHours / classified : null,
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
  /** Alle Feiertage (offiziell und importiert) – für Basis und Prognose */
  holidayKeys: ReadonlySet<string>;
  /** Importierte Feiertage – für „bis heute“, wie im Saldo */
  importedHolidayKeys: ReadonlySet<string>;
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

  // Geplante Abwesenheiten liegen nach heute. Anteil je Tag wie im
  // Abwesenheiten-Bericht: Stunden / Tagessoll, höchstens ein Tag
  // (4 h Urlaub bei 8 h Tagessoll = halber Tag).
  const plannedHours = new Map<string, number>();
  for (const entry of input.entries) {
    if (!isAbsence(entry) || entry.date <= todayKey) continue;
    plannedHours.set(
      entry.date,
      (plannedHours.get(entry.date) ?? 0) + entry.hours,
    );
  }
  const plannedShare = (key: string): number => {
    const hours = plannedHours.get(key);
    if (hours === undefined) return 0;
    if (schedule.dailyHours <= 0 || hours <= 0) return 1;
    return Math.min(1, hours / schedule.dailyHours);
  };

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
    const targetHours = availableDays * schedule.dailyHours;
    const expectedHours = availableDays * hoursPerDay;
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
            holidayKeys: input.importedHolidayKeys,
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
