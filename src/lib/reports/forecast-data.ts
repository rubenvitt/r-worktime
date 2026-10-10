// Datenzugriff für Jahresübersicht und Prognose (nur Server).
// Die Rechnung selbst steckt in year.ts und forecast.ts.

import { EntryType } from "@prisma/client";
import { excludeAdjustmentFilter, findAdjustmentEntry } from "@/lib/adjustment";
import {
  berlinDayStart,
  dateKeyFromDbDate,
  shiftDateKey,
  weekdayOfKey,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import type {
  ReportEntry,
  ReportEntryType,
  WorkSchedule,
} from "@/lib/reports/year";
import { HolidayService } from "@/services/holiday.service";
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
// Feiertage: importierte HOLIDAY-Einträge plus offizielle Feiertage aus dem
// Feiertags-Service (Niedersachsen, wie der Import unter Einstellungen).

const holidayService = new HolidayService();
const HOLIDAY_CACHE_TTL = 24 * 60 * 60 * 1000;
const HOLIDAY_FETCH_TIMEOUT = 5_000;
const holidayCache = new Map<
  number,
  { fetchedAt: number; holidays: Promise<Map<string, string>> }
>();

async function officialHolidays(year: number): Promise<Map<string, string>> {
  const cached = holidayCache.get(year);
  if (cached && Date.now() - cached.fetchedAt < HOLIDAY_CACHE_TTL) {
    return cached.holidays;
  }
  // Ohne Timeout bliebe ein hängender Abruf 24 h im Cache und blockierte die Routen
  const holidays = Promise.race([
    holidayService.fetchHolidaysForYear(year),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Feiertags-Dienst antwortet nicht")),
        HOLIDAY_FETCH_TIMEOUT,
      ),
    ),
  ]).then((list) => new Map(list.map((h) => [h.date.slice(0, 10), h.fname])));
  holidayCache.set(year, { fetchedAt: Date.now(), holidays });
  try {
    return await holidays;
  } catch (error) {
    // Fehlschläge nicht cachen, beim nächsten Aufruf neu versuchen
    holidayCache.delete(year);
    throw error;
  }
}

export interface HolidayData {
  /** Importierte HOLIDAY-Einträge – mindern das Soll im Saldo */
  importedKeys: Set<string>;
  /** Offizielle und importierte Feiertage */
  allKeys: Set<string>;
  /** Datum → Name */
  names: Record<string, string>;
  /** Jahre, für die der Feiertags-Service nicht erreichbar war */
  unavailableYears: number[];
  /** Jahre mit offiziellen Feiertagen auf Arbeitstagen, aber ohne Import */
  notImportedYears: number[];
}

export async function loadHolidays(
  userId: string,
  years: number[],
  workDays: readonly number[],
): Promise<HolidayData> {
  const sortedYears = [...new Set(years)].sort((a, b) => a - b);
  if (sortedYears.length === 0) {
    return {
      importedKeys: new Set(),
      allKeys: new Set(),
      names: {},
      unavailableYears: [],
      notImportedYears: [],
    };
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
    Promise.all(
      sortedYears.map((year) =>
        officialHolidays(year).then(
          (map) => ({ year, map }),
          (error: unknown) => {
            console.error(`Feiertage ${year} nicht verfügbar:`, error);
            return { year, map: null };
          },
        ),
      ),
    ),
  ]);

  const importedKeys = new Set<string>();
  const names: Record<string, string> = {};
  const importedYears = new Set<number>();
  for (const row of imported) {
    const key = dateKeyFromDbDate(row.date);
    importedKeys.add(key);
    importedYears.add(Number(key.slice(0, 4)));
    if (row.description) names[key] = row.description;
  }

  const allKeys = new Set(importedKeys);
  const unavailableYears: number[] = [];
  const notImportedYears: number[] = [];
  for (const { year, map } of official) {
    if (!map) {
      unavailableYears.push(year);
      continue;
    }
    let onWorkDay = false;
    for (const [key, name] of map) {
      allKeys.add(key);
      names[key] ??= name;
      if (workDays.includes(weekdayOfKey(key))) onWorkDay = true;
    }
    if (onWorkDay && !importedYears.has(year)) notImportedYears.push(year);
  }

  return { importedKeys, allKeys, names, unavailableYears, notImportedYears };
}

/** Aktueller Saldo – dieselbe Quelle wie /overtime. */
export async function loadCurrentBalance(userId: string): Promise<number> {
  const balance = await overtimeService.calculateBalance({
    userId,
    includeDetails: true,
  });
  return balance.balance;
}
