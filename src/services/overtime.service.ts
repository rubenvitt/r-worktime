import type { Prisma } from "@prisma/client";
import { excludeAdjustmentFilter, findAdjustmentEntry } from "@/lib/adjustment";
import {
  berlinDayStart,
  dateKeyFromDbDate,
  type IsoWeek,
  isoWeekOf,
  isoWeekRange,
  monthRange,
  shiftDateKey,
  weekdayOfKey,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { splitHoursByBillingClass } from "@/lib/reports/billing";
import { EntryType } from "@/types/database";
import type {
  CacheEntry,
  DailyStatistics,
  MonthlyStatistics,
  OvertimeBalance,
  OvertimeCalculationParams,
  WeeklyStatistics,
} from "@/types/statistics";

export class OvertimeService {
  private static instance: OvertimeService;
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 Minuten
  private readonly DEFAULT_DAILY_HOURS = 8;
  private readonly DEFAULT_WEEKLY_HOURS = 40;

  private constructor() {}

  static getInstance(): OvertimeService {
    if (!OvertimeService.instance) {
      OvertimeService.instance = new OvertimeService();
    }
    return OvertimeService.instance;
  }

  private getCacheKey(userId: string, type: string, params?: unknown): string {
    return `${userId}:${type}:${JSON.stringify(params || {})}`;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  private setCache<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.DEFAULT_TTL,
    });
  }

  public invalidateCache(userId?: string): void {
    if (userId) {
      // Invalidiere nur Cache für spezifischen User
      const keysToDelete: string[] = [];
      this.cache.forEach((_, key) => {
        if (key.startsWith(`${userId}:`)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => {
        this.cache.delete(key);
      });
    } else {
      // Invalidiere gesamten Cache
      this.cache.clear();
    }
  }

  private roundToQuarterHour(hours: number): number {
    return Math.round(hours * 4) / 4;
  }

  async getUserSettings(userId: string): Promise<{
    weeklyHours: number;
    dailyHours: number;
    workDays: number[];
  } | null> {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // Falls keine Settings existieren, Default-Werte zurückgeben
    if (!settings) {
      return {
        weeklyHours: this.DEFAULT_WEEKLY_HOURS,
        dailyHours: this.DEFAULT_DAILY_HOURS,
        workDays: [1, 2, 3, 4, 5], // Montag bis Freitag
      };
    }

    // Konvertiere Decimal zu number und nutze die neuen workDays
    const workDaysCount = settings.workDays.length || 5;
    return {
      weeklyHours: settings.weeklyWorkHours.toNumber(),
      dailyHours: settings.weeklyWorkHours.toNumber() / workDaysCount,
      workDays: settings.workDays || [1, 2, 3, 4, 5],
    };
  }

  async calculateBalance(
    params: OvertimeCalculationParams,
  ): Promise<OvertimeBalance> {
    const { userId, startDate, endDate, includeDetails = true } = params;

    // Cache-Check
    const cacheKey = this.getCacheKey(userId, "balance", params);
    const cached = this.getFromCache<OvertimeBalance>(cacheKey);
    if (cached) return cached;

    // Hole User Settings
    const settings = await this.getUserSettings(userId);
    if (!settings) {
      throw new Error("User settings not found");
    }

    // Prüfe ob es einen Anfangssaldo gibt
    const adjustmentEntry = await findAdjustmentEntry(userId);

    // Bestimme den Zeitraum für die Berechnung
    // Wenn es einen Anfangssaldo gibt, starte die Sollzeit-Berechnung erst ab dem Tag NACH dem Adjustment
    let calculationStartDate: Date;
    let initialBalance = 0;

    if (adjustmentEntry) {
      // Der Anfangssaldo deckt seinen eigenen Tag schon ab: Soll und Ist zählen
      // erst ab dem Folgetag. Über den Datums-Key gerechnet, damit der Tag nach
      // der Zeitumstellung nicht um 01:00 UTC beginnt (@db.Date = 00:00 UTC).
      const dayAfterAdjustment = berlinDayStart(
        shiftDateKey(dateKeyFromDbDate(adjustmentEntry.date), 1),
      );
      calculationStartDate =
        startDate && startDate > dayAfterAdjustment
          ? startDate
          : dayAfterAdjustment;

      // Der Anfangssaldo selbst (z.B. 0 bedeutet: bis zu diesem Tag genau Sollzeit gearbeitet)
      initialBalance = adjustmentEntry.duration.toNumber();
    } else {
      calculationStartDate =
        startDate || new Date(new Date().getFullYear(), 0, 1);
    }

    const calculationEndDate = endDate || new Date();

    // Berechne die Sollzeit für ALLE Arbeitstage im Zeitraum (ab Adjustment-Datum oder Start)
    let targetHours = 0;
    const currentDate = new Date(calculationStartDate);

    while (currentDate <= calculationEndDate) {
      const dayOfWeek = currentDate.getDay();
      // Prüfe ob es ein Arbeitstag ist (Montag = 1, Dienstag = 2, etc.)
      if (settings.workDays.includes(dayOfWeek)) {
        targetHours += settings.dailyHours;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Query für TimeEntries ab demselben Tag wie das Soll (ohne Anfangssaldo)
    const whereClause: Prisma.TimeEntryWhereInput = {
      userId,
      date: {
        gte: calculationStartDate,
        lte: calculationEndDate,
      },
      // Anfangssaldo ausschließen, Einträge ohne description behalten
      ...excludeAdjustmentFilter(),
    };

    const entries = await prisma.timeEntry.findMany({
      where: whereClause,
      orderBy: { date: "asc" },
    });

    // Berechne tatsächliche Arbeitsstunden (ohne Anfangssaldo)
    let actualHours = 0;
    const holidayDates = new Set<string>(); // Track Feiertage

    for (const entry of entries) {
      const dayOfWeek = entry.date.getDay();
      const isWorkDay = settings.workDays.includes(dayOfWeek);
      const dateStr = entry.date.toISOString().split("T")[0];
      const durationNumber = entry.duration.toNumber();

      switch (entry.type) {
        case EntryType.WORK:
          actualHours += this.roundToQuarterHour(durationNumber);
          break;

        case EntryType.VACATION:
        case EntryType.SICK:
          // Bei Urlaub/Krankheit zählen die normalen Arbeitsstunden
          if (isWorkDay) {
            actualHours += settings.dailyHours;
          }
          break;

        case EntryType.HOLIDAY:
          // Feiertage reduzieren die Sollzeit
          if (isWorkDay && !holidayDates.has(dateStr)) {
            targetHours -= settings.dailyHours;
            holidayDates.add(dateStr);
          }
          break;

        case EntryType.OVERTIME:
          // Überstunden-Einträge (aber nicht der Anfangssaldo)
          actualHours += this.roundToQuarterHour(durationNumber);
          break;

        default:
          // Alle anderen Einträge
          actualHours += this.roundToQuarterHour(durationNumber);
          break;
      }
    }

    // Berechne finale Überstunden: Anfangssaldo + (gearbeitete Stunden - Sollzeit)
    const overtimeHours = this.roundToQuarterHour(
      initialBalance + actualHours - targetHours,
    );

    const balance: OvertimeBalance = {
      userId,
      balance: overtimeHours,
      lastUpdated: new Date(),
    };

    if (includeDetails) {
      balance.details = {
        actualHours: this.roundToQuarterHour(actualHours + initialBalance),
        targetHours: this.roundToQuarterHour(targetHours),
        overtimeHours,
      };
    }

    if (startDate && endDate) {
      balance.period = { startDate, endDate };
    }

    // Cache das Ergebnis
    this.setCache(cacheKey, balance);

    return balance;
  }

  async calculateWeeklyStatistics(
    userId: string,
    year: number,
    week: number,
  ): Promise<WeeklyStatistics> {
    const cacheKey = this.getCacheKey(userId, "weekly", { year, week });
    const cached = this.getFromCache<WeeklyStatistics>(cacheKey);
    if (cached) return cached;

    const settings = await this.getUserSettings(userId);
    if (!settings) {
      throw new Error("User settings not found");
    }

    // ISO-8601-Woche (Montag bis Sonntag) auf Berliner Kalendertagen;
    // wirft bei Wochen, die es im Jahr nicht gibt
    const range = isoWeekRange(year, week);

    const entries = await prisma.timeEntry.findMany({
      where: {
        userId,
        date: {
          gte: range.start,
          lte: range.end,
        },
      },
      orderBy: { date: "asc" },
    });

    // Gruppiere Entries nach Tag
    const entriesByDay = new Map<string, typeof entries>();
    entries.forEach((entry) => {
      const dateKey = dateKeyFromDbDate(entry.date);
      if (!entriesByDay.has(dateKey)) {
        entriesByDay.set(dateKey, []);
      }
      entriesByDay.get(dateKey)?.push(entry);
    });

    // Berechne tägliche Statistiken
    const dailyBreakdown: DailyStatistics[] = [];
    let totalHours = 0;
    let targetHours = 0;
    const entryTypes = {
      work: 0,
      vacation: 0,
      sick: 0,
      holiday: 0,
    };

    for (const dateKey of range.dayKeys) {
      const dayEntries = entriesByDay.get(dateKey) || [];
      const dayOfWeek = weekdayOfKey(dateKey);
      const isWorkDay = settings.workDays.includes(dayOfWeek);

      let dayActual = 0;
      let dayTarget = isWorkDay ? settings.dailyHours : 0;
      let primaryType = EntryType.WORK;

      for (const entry of dayEntries) {
        const hours = this.roundToQuarterHour(entry.duration.toNumber());

        switch (entry.type) {
          case EntryType.WORK:
            dayActual += hours;
            entryTypes.work += hours;
            break;
          case EntryType.VACATION:
            dayActual = settings.dailyHours;
            entryTypes.vacation += settings.dailyHours;
            primaryType = EntryType.VACATION;
            break;
          case EntryType.SICK:
            dayActual = settings.dailyHours;
            entryTypes.sick += settings.dailyHours;
            primaryType = EntryType.SICK;
            break;
          case EntryType.HOLIDAY:
            dayTarget = 0;
            entryTypes.holiday += settings.dailyHours;
            primaryType = EntryType.HOLIDAY;
            break;
        }
      }

      totalHours += dayActual;
      targetHours += dayTarget;

      dailyBreakdown.push({
        date: berlinDayStart(dateKey),
        actualHours: this.roundToQuarterHour(dayActual),
        targetHours: dayTarget,
        overtimeHours: this.roundToQuarterHour(dayActual - dayTarget),
        entryType: primaryType,
      });
    }

    const weeklyStats: WeeklyStatistics = {
      userId,
      year,
      week,
      totalHours: this.roundToQuarterHour(totalHours),
      targetHours: this.roundToQuarterHour(targetHours),
      overtimeHours: this.roundToQuarterHour(totalHours - targetHours),
      dailyBreakdown,
      entryTypes,
    };

    this.setCache(cacheKey, weeklyStats);
    return weeklyStats;
  }

  async calculateMonthlyStatistics(
    userId: string,
    year: number,
    month: number,
  ): Promise<MonthlyStatistics> {
    const cacheKey = this.getCacheKey(userId, "monthly", { year, month });
    const cached = this.getFromCache<MonthlyStatistics>(cacheKey);
    if (cached) return cached;

    const range = monthRange(`${year}-${String(month).padStart(2, "0")}`);

    const entries = await prisma.timeEntry.findMany({
      where: {
        userId,
        date: {
          gte: range.start,
          lte: range.end,
        },
      },
    });

    // Wöchentliche Aufschlüsselung nach ISO-Woche; Anfang Januar und Ende
    // Dezember gehören die Tage ggf. zum ISO-Wochenjahr davor bzw. danach
    const weeklyBreakdown: WeeklyStatistics[] = [];
    const weeksInMonth = new Map<string, IsoWeek>();

    entries.forEach((entry) => {
      const iso = isoWeekOf(dateKeyFromDbDate(entry.date));
      const key = `${iso.year}-${String(iso.week).padStart(2, "0")}`;
      weeksInMonth.set(key, iso);
    });

    const sortedWeeks = [...weeksInMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, iso]) => iso);
    for (const iso of sortedWeeks) {
      const weekStats = await this.calculateWeeklyStatistics(
        userId,
        iso.year,
        iso.week,
      );
      weeklyBreakdown.push(weekStats);
    }

    // Aggregiere Monatsdaten
    let totalHours = 0;
    let targetHours = 0;
    const roundedEntries = entries.map((entry) => ({
      type: entry.type,
      source: entry.source,
      description: entry.description,
      billingStatus: entry.billingStatus,
      hours: this.roundToQuarterHour(entry.duration.toNumber()),
    }));

    for (const entry of roundedEntries) {
      totalHours += entry.hours;
    }

    // Abrechnung nach Timing-Status; nur echte Arbeit (ohne Abwesenheiten
    // und Anfangssaldo). Einträge ohne Status zählen als „unbekannt“.
    const billing = splitHoursByBillingClass(roundedEntries);

    // Berechne Target Hours für den Monat
    const settings = await this.getUserSettings(userId);
    let workDaysInMonth = 0;
    for (
      let key = range.firstKey;
      key <= range.lastKey;
      key = shiftDateKey(key, 1)
    ) {
      if (settings?.workDays.includes(weekdayOfKey(key))) workDaysInMonth++;
    }
    targetHours = workDaysInMonth * (settings?.dailyHours || 8);

    const monthlyStats: MonthlyStatistics = {
      userId,
      year,
      month,
      totalHours: this.roundToQuarterHour(totalHours),
      targetHours: this.roundToQuarterHour(targetHours),
      overtimeHours: this.roundToQuarterHour(totalHours - targetHours),
      weeklyBreakdown,
      billableHours: this.roundToQuarterHour(billing.billable),
      nonBillableHours: this.roundToQuarterHour(billing.nonBillable),
      unknownHours: this.roundToQuarterHour(billing.unknown),
    };

    this.setCache(cacheKey, monthlyStats);
    return monthlyStats;
  }

  async recalculateHistoricalData(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<void> {
    // Invalidiere Cache für User
    this.invalidateCache(userId);

    // Optional: Trigger Neuberechnung von Materialized Views
    // Dies würde in einem Production-System über einen Background Job laufen
    await this.calculateBalance({
      userId,
      startDate,
      endDate,
      includeDetails: true,
    });
  }
}

export const overtimeService = OvertimeService.getInstance();
