// Jahres- und Quartalsübersicht (reine Funktionen, testbar).
//
// Die Regeln folgen dem Überstunden-Saldo (overtime.service › calculateBalance),
// damit der kumulierte Verlauf zu /overtime passt:
// - Soll: Tagessoll an jedem konfigurierten Arbeitstag, außer an Feiertagen.
// - Ist: WORK und OVERTIME, jeder Eintrag auf Viertelstunden gerundet;
//   Urlaub/Krank schreibt an einem Soll-Tag das Tagessoll gut.
// - Gezählt wird erst ab dem Erfassungsbeginn (Tag nach dem Anfangssaldo).
// Abweichung zum Saldo: Urlaub/Krank zählt pro Tag nur einmal und an
// Feiertagen gar nicht (der Saldo schreibt pro Eintrag gut).

import { monthRange, shiftDateKey, weekdayOfKey } from "@/lib/dates";
import { classifyBillingStatus } from "@/lib/reports/billing-status";

export type ReportEntryType =
  | "WORK"
  | "OVERTIME"
  | "VACATION"
  | "SICK"
  | "HOLIDAY";

/** Zeiteintrag in der Form, die die Berichte brauchen. */
export interface ReportEntry {
  /** Kalendertag "YYYY-MM-DD" */
  date: string;
  /** Dauer in Dezimalstunden (ungerundet) */
  hours: number;
  type: ReportEntryType;
  /** EntrySource, z. B. TIMING_SYNC, BULK_FILL, ADJUSTMENT */
  source: string;
  billingStatus: string | null;
}

export interface WorkSchedule {
  /** 0 = Sonntag … 6 = Samstag (wie UserSettings.workDays) */
  workDays: readonly number[];
  /** Tagessoll in Stunden (Wochenstunden / Anzahl Arbeitstage) */
  dailyHours: number;
}

/** Quellen, die keine echte Arbeit abbilden. */
const SYNTHETIC_SOURCES: ReadonlySet<string> = new Set([
  "ADJUSTMENT",
  "HOLIDAY",
  "BULK_FILL",
]);

export function roundToQuarterHour(hours: number): number {
  return Math.round(hours * 4) / 4;
}

/** Alle Kalendertage von `from` bis `to` (inklusive). */
export function dateKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let key = from; key <= to; key = shiftDateKey(key, 1)) keys.push(key);
  return keys;
}

export function isWorkEntry(entry: ReportEntry): boolean {
  return (
    (entry.type === "WORK" || entry.type === "OVERTIME") &&
    entry.source !== "ADJUSTMENT"
  );
}

/** Arbeit, die als Erfahrungswert taugt: ohne Saldo, Feiertage und Auffüllung. */
export function isRealWork(entry: ReportEntry): boolean {
  return isWorkEntry(entry) && !SYNTHETIC_SOURCES.has(entry.source);
}

export function isAbsence(entry: ReportEntry): boolean {
  return entry.type === "VACATION" || entry.type === "SICK";
}

export interface RangeSummary {
  /** Ist = Arbeit + Gutschrift für Urlaub/Krank */
  actualHours: number;
  targetHours: number;
  /** WORK/OVERTIME, je Eintrag auf Viertelstunden gerundet */
  workHours: number;
  billableHours: number;
  nonBillableHours: number;
  unknownBillingHours: number;
  /** Konfigurierte Arbeitstage im Zeitraum (inkl. Feiertage/Urlaub) */
  workDays: number;
  /** Feiertage, die auf einen Arbeitstag fallen */
  holidayDays: number;
  /** Urlaubs-/Krankheitstage an Soll-Tagen */
  absenceDays: number;
}

export function emptySummary(): RangeSummary {
  return {
    actualHours: 0,
    targetHours: 0,
    workHours: 0,
    billableHours: 0,
    nonBillableHours: 0,
    unknownBillingHours: 0,
    workDays: 0,
    holidayDays: 0,
    absenceDays: 0,
  };
}

export function addSummaries(a: RangeSummary, b: RangeSummary): RangeSummary {
  return {
    actualHours: a.actualHours + b.actualHours,
    targetHours: a.targetHours + b.targetHours,
    workHours: a.workHours + b.workHours,
    billableHours: a.billableHours + b.billableHours,
    nonBillableHours: a.nonBillableHours + b.nonBillableHours,
    unknownBillingHours: a.unknownBillingHours + b.unknownBillingHours,
    workDays: a.workDays + b.workDays,
    holidayDays: a.holidayDays + b.holidayDays,
    absenceDays: a.absenceDays + b.absenceDays,
  };
}

export interface RangeOptions {
  from: string;
  to: string;
  schedule: WorkSchedule;
  holidayKeys: ReadonlySet<string>;
}

/** Soll, Ist und Abrechnung für einen Zeitraum (inklusive Grenzen). */
export function summarizeRange(
  entries: readonly ReportEntry[],
  { from, to, schedule, holidayKeys }: RangeOptions,
): RangeSummary {
  const summary = emptySummary();
  if (from > to) return summary;

  const absenceDays = new Set<string>();
  for (const entry of entries) {
    if (entry.date < from || entry.date > to) continue;
    if (isAbsence(entry)) {
      absenceDays.add(entry.date);
      continue;
    }
    if (!isWorkEntry(entry)) continue;
    const hours = roundToQuarterHour(entry.hours);
    summary.workHours += hours;
    const billingClass = classifyBillingStatus(entry.billingStatus);
    if (billingClass === "billable") summary.billableHours += hours;
    else if (billingClass === "nonBillable") summary.nonBillableHours += hours;
    else summary.unknownBillingHours += hours;
  }

  for (const key of dateKeysBetween(from, to)) {
    if (!schedule.workDays.includes(weekdayOfKey(key))) continue;
    summary.workDays++;
    if (holidayKeys.has(key)) {
      summary.holidayDays++;
      continue;
    }
    summary.targetHours += schedule.dailyHours;
    if (absenceDays.has(key)) {
      summary.absenceDays++;
      summary.actualHours += schedule.dailyHours;
    }
  }
  summary.actualHours += summary.workHours;
  return summary;
}

// ---------------------------------------------------------------------------
// Jahresübersicht

export type PeriodStatus = "untracked" | "closed" | "current" | "future";

export interface YearMonth extends RangeSummary {
  /** "YYYY-MM" */
  month: string;
  status: PeriodStatus;
  /** Gezählter Zeitraum; null bei unerfassten/zukünftigen Monaten */
  from: string | null;
  to: string | null;
  deltaHours: number;
  /** Saldo am Ende des gezählten Zeitraums */
  balanceHours: number | null;
}

export interface YearQuarter extends RangeSummary {
  quarter: 1 | 2 | 3 | 4;
  months: string[];
  status: PeriodStatus;
  deltaHours: number;
  balanceHours: number | null;
}

export interface YearReport {
  year: number;
  todayKey: string;
  trackingStart: string | null;
  /** Saldo zu Jahresbeginn bzw. zum Erfassungsbeginn im Jahr */
  openingBalance: number | null;
  /** Saldo am Ende des letzten gezählten Tags im Jahr */
  closingBalance: number | null;
  months: YearMonth[];
  quarters: YearQuarter[];
  totals: RangeSummary & { deltaHours: number };
}

export interface YearReportInput {
  year: number;
  todayKey: string;
  /** Einträge ab Erfassungsbeginn bis Jahresende (ohne Anfangssaldo) */
  entries: readonly ReportEntry[];
  schedule: WorkSchedule;
  /** Feiertage, die die Sollzeit mindern */
  holidayKeys: ReadonlySet<string>;
  /** Erster gezählter Tag; null = nichts erfasst */
  trackingStart: string | null;
  /** Anfangssaldo in Stunden (0 ohne Anfangssaldo) */
  initialBalance: number;
}

function quarterStatus(statuses: PeriodStatus[]): PeriodStatus {
  if (statuses.includes("current")) return "current";
  if (statuses.every((s) => s === "untracked")) return "untracked";
  if (statuses.every((s) => s === "future")) return "future";
  if (statuses.includes("closed")) return "closed";
  return "future";
}

export function buildYearReport(input: YearReportInput): YearReport {
  const { year, todayKey, entries, schedule, holidayKeys, trackingStart } =
    input;
  const yearFirst = `${year}-01-01`;
  const yearLast = `${year}-12-31`;
  const options = { schedule, holidayKeys };

  // Saldo zu Beginn des Jahres (bzw. am Erfassungsbeginn, falls im Jahr)
  let openingBalance: number | null = null;
  if (trackingStart !== null && trackingStart <= yearLast) {
    openingBalance = input.initialBalance;
    if (trackingStart < yearFirst) {
      const before = summarizeRange(entries, {
        ...options,
        from: trackingStart,
        to: todayKey < yearFirst ? todayKey : shiftDateKey(yearFirst, -1),
      });
      openingBalance += before.actualHours - before.targetHours;
    }
  }

  let running = openingBalance;
  const months: YearMonth[] = [];
  for (let index = 0; index < 12; index++) {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const { firstKey: first, lastKey: last } = monthRange(month);
    let status: PeriodStatus;
    if (first > todayKey) status = "future";
    else if (trackingStart === null || trackingStart > last)
      status = "untracked";
    else status = last <= todayKey ? "closed" : "current";

    if (
      status === "future" ||
      status === "untracked" ||
      trackingStart === null
    ) {
      months.push({
        ...emptySummary(),
        month,
        status,
        from: null,
        to: null,
        deltaHours: 0,
        balanceHours: null,
      });
      continue;
    }

    const from = trackingStart > first ? trackingStart : first;
    const to = todayKey < last ? todayKey : last;
    const summary = summarizeRange(entries, { ...options, from, to });
    const deltaHours = summary.actualHours - summary.targetHours;
    running = (running ?? 0) + deltaHours;
    months.push({
      ...summary,
      month,
      status,
      from,
      to,
      deltaHours,
      balanceHours: running,
    });
  }

  const quarters: YearQuarter[] = ([1, 2, 3, 4] as const).map((quarter) => {
    const slice = months.slice((quarter - 1) * 3, quarter * 3);
    const summary = slice.reduce<RangeSummary>(
      (acc, m) => addSummaries(acc, m),
      emptySummary(),
    );
    const counted = slice.filter((m) => m.balanceHours !== null);
    return {
      ...summary,
      quarter,
      months: slice.map((m) => m.month),
      status: quarterStatus(slice.map((m) => m.status)),
      deltaHours: summary.actualHours - summary.targetHours,
      balanceHours: counted.length
        ? (counted[counted.length - 1].balanceHours ?? null)
        : null,
    };
  });

  const totalsSummary = months.reduce<RangeSummary>(
    (acc, m) => addSummaries(acc, m),
    emptySummary(),
  );
  const countedMonths = months.filter((m) => m.balanceHours !== null);

  return {
    year,
    todayKey,
    trackingStart,
    openingBalance,
    closingBalance: countedMonths.length
      ? (countedMonths[countedMonths.length - 1].balanceHours ?? null)
      : null,
    months,
    quarters,
    totals: {
      ...totalsSummary,
      deltaHours: totalsSummary.actualHours - totalsSummary.targetHours,
    },
  };
}
