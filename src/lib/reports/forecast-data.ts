// Datenzugriff für Jahresübersicht und Prognose (nur Server).
// Die Rechnung selbst steckt in year.ts und forecast.ts.

import { EntryType } from "@prisma/client";
import { excludeAdjustmentFilter, findAdjustmentEntry } from "@/lib/adjustment";
import { berlinDayStart, dateKeyFromDbDate, shiftDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import type {
  ReportEntry,
  ReportEntryType,
  WorkSchedule,
} from "@/lib/reports/year";
import { loadOfficialHolidays } from "@/services/holiday.service";
import { overtimeService } from "@/services/overtime.service";

export interface ReportContext {
  schedule: WorkSchedule;
  weeklyHours: number;
  /** Anfangssaldo in Stunden; 0 ohne Anfangssaldo */
  initialBalance: number;
  /** Tag des Anfangssaldos */
  adjustmentDate: string | null;
  /** Erster gezählter Tag: Tag nach dem Anfangssaldo, sonst erster Eintrag */
  trackingStart: string | null;
}

export async function loadReportContext(
  userId: string,
): Promise<ReportContext> {
  const [settings, adjustment] = await Promise.all([
    overtimeService.getUserSettings(userId),
    findAdjustmentEntry(userId),
  ]);
  const workDays = settings?.workDays ?? [1, 2, 3, 4, 5];
  const weeklyHours = settings?.weeklyHours ?? 40;
  const schedule: WorkSchedule = {
    workDays,
    dailyHours: settings?.dailyHours ?? weeklyHours / (workDays.length || 5),
  };

  if (adjustment) {
    const adjustmentDate = dateKeyFromDbDate(adjustment.date);
    return {
      schedule,
      weeklyHours,
      initialBalance: adjustment.duration.toNumber(),
      adjustmentDate,
      trackingStart: shiftDateKey(adjustmentDate, 1),
    };
  }

  const first = await prisma.timeEntry.findFirst({
    where: { userId, ...excludeAdjustmentFilter() },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  return {
    schedule,
    weeklyHours,
    initialBalance: 0,
    adjustmentDate: null,
    trackingStart: first ? dateKeyFromDbDate(first.date) : null,
  };
}

/** Einträge im Zeitraum (inklusive), ohne Anfangssaldo. */
export async function loadReportEntries(
  userId: string,
  from: string,
  to: string,
): Promise<ReportEntry[]> {
  if (from > to) return [];
  const rows = await prisma.timeEntry.findMany({
    where: {
      userId,
      date: { gte: berlinDayStart(from), lte: berlinDayStart(to) },
      ...excludeAdjustmentFilter(),
    },
    select: {
      date: true,
      duration: true,
      type: true,
      source: true,
      billingStatus: true,
    },
    orderBy: { date: "asc" },
  });
  return rows.map((row) => ({
    date: dateKeyFromDbDate(row.date),
    hours: row.duration.toNumber(),
    type: row.type as ReportEntryType,
    source: row.source,
    billingStatus: row.billingStatus,
  }));
}

// ---------------------------------------------------------------------------
// Feiertage: offizielle Feiertage aus dem Feiertags-Dienst (Niedersachsen, mit
// Cache) plus importierte HOLIDAY-Einträge. Beide mindern das Soll – im Saldo,
// in der Woche, in Jahresübersicht und Prognose.

export {
  loadOfficialHolidays,
  type OfficialHolidayData,
} from "@/services/holiday.service";

export interface HolidayData {
  /** Offizielle und importierte Feiertage – mindern an Arbeitstagen das Soll */
  allKeys: Set<string>;
  /** Datum → Name */
  names: Record<string, string>;
  /** Jahre, für die der Feiertags-Dienst nicht erreichbar war (nur Import zählt) */
  unavailableYears: number[];
}

export async function loadHolidays(
  userId: string,
  years: number[],
): Promise<HolidayData> {
  const sortedYears = [...new Set(years)].sort((a, b) => a - b);
  if (sortedYears.length === 0) {
    return { allKeys: new Set(), names: {}, unavailableYears: [] };
  }

  const first = sortedYears[0];
  const last = sortedYears[sortedYears.length - 1];
  const [imported, official] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        userId,
        type: EntryType.HOLIDAY,
        date: {
          gte: berlinDayStart(`${first}-01-01`),
          lte: berlinDayStart(`${last}-12-31`),
        },
      },
      select: { date: true, description: true },
    }),
    loadOfficialHolidays(sortedYears),
  ]);

  const allKeys = new Set<string>();
  const names: Record<string, string> = {};
  for (const [key, name] of Object.entries(official.names)) {
    allKeys.add(key);
    names[key] = name;
  }
  for (const row of imported) {
    const key = dateKeyFromDbDate(row.date);
    allKeys.add(key);
    names[key] ??= row.description || "Feiertag";
  }

  return { allKeys, names, unavailableYears: official.unavailableYears };
}

/** Aktueller Saldo – dieselbe Quelle wie /overtime. */
export async function loadCurrentBalance(userId: string): Promise<number> {
  const balance = await overtimeService.calculateBalance({
    userId,
    includeDetails: true,
  });
  return balance.balance;
}
