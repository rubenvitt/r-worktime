import type { Prisma } from "@prisma/client";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { prisma } from "@/lib/prisma";
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

    // Konvertiere Decimal zu number
    return {
      weeklyHours: settings.weeklyWorkHours.toNumber(),
      dailyHours: settings.weeklyWorkHours.toNumber() / 5, // Annahme: 5 Arbeitstage
      workDays: [1, 2, 3, 4, 5], // Default Arbeitstage
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
    const adjustmentEntry = await prisma.timeEntry.findFirst({
      where: {
        userId,
        description: {
          contains: "Anfangs-Überstunden-Saldo",
        },
      },
      orderBy: { date: "asc" },
    });

    // Bestimme den Zeitraum für die Berechnung
    // Wenn es einen Anfangssaldo gibt, starte die Sollzeit-Berechnung erst ab dem Tag NACH dem Adjustment
    let calculationStartDate: Date;
    let initialBalance = 0;

    if (adjustmentEntry) {
      // Starte Sollzeit-Berechnung am Tag nach dem Adjustment
      const adjustmentDate = new Date(adjustmentEntry.date);
      adjustmentDate.setDate(adjustmentDate.getDate() + 1);
      calculationStartDate =
        startDate && startDate > adjustmentDate ? startDate : adjustmentDate;

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

    // Query für TimeEntries (ohne den Adjustment-Eintrag selbst, aber ab seinem Datum)
    const whereClause: Prisma.TimeEntryWhereInput = {
      userId,
      date: {
        gte: adjustmentEntry ? adjustmentEntry.date : calculationStartDate,
        lte: calculationEndDate,
      },
      // Schließe den Anfangssaldo-Eintrag aus
      NOT: {
        description: {
          contains: "Anfangs-Überstunden-Saldo",
        },
      },
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

    // Berechne Start- und Enddatum der Woche
    const firstDayOfYear = new Date(year, 0, 1);
    const daysToAdd = (week - 1) * 7;
    const weekStart = startOfWeek(
      new Date(firstDayOfYear.getTime() + daysToAdd * 24 * 60 * 60 * 1000),
      { weekStartsOn: 1 },
    );
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

    const entries = await prisma.timeEntry.findMany({
      where: {
        userId,
        date: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
      orderBy: { date: "asc" },
    });

    // Gruppiere Entries nach Tag
    const entriesByDay = new Map<string, typeof entries>();
    entries.forEach((entry) => {
      const dateKey = format(entry.date, "yyyy-MM-dd");
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

    const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

    for (const day of daysInWeek) {
      const dateKey = format(day, "yyyy-MM-dd");
      const dayEntries = entriesByDay.get(dateKey) || [];
      const dayOfWeek = day.getDay();
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
        date: day,
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

    const monthStart = startOfMonth(new Date(year, month - 1));
    const monthEnd = endOfMonth(monthStart);

    const entries = await prisma.timeEntry.findMany({
      where: {
        userId,
        date: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    });

    // Berechne wöchentliche Breakdown
    const weeklyBreakdown: WeeklyStatistics[] = [];
    const weeksInMonth = new Set<number>();

    entries.forEach((entry) => {
      const week = getWeek(entry.date, { weekStartsOn: 1 });
      weeksInMonth.add(week);
    });

    for (const week of Array.from(weeksInMonth).sort()) {
      const weekStats = await this.calculateWeeklyStatistics(
        userId,
        year,
        week,
      );
      weeklyBreakdown.push(weekStats);
    }

    // Aggregiere Monatsdaten
    let totalHours = 0;
    let targetHours = 0;
    let billableHours = 0;
    let nonBillableHours = 0;

    entries.forEach((entry) => {
      const hours = this.roundToQuarterHour(entry.duration.toNumber());
      totalHours += hours;

      // Da billable nicht in der DB ist, nehmen wir an dass WORK billable ist
      if (entry.type === EntryType.WORK) {
        billableHours += hours;
      } else {
        nonBillableHours += hours;
      }
    });

    // Berechne Target Hours für den Monat
    const settings = await this.getUserSettings(userId);
    const workDaysInMonth = eachDayOfInterval({
      start: monthStart,
      end: monthEnd,
    }).filter((day) => settings?.workDays.includes(day.getDay())).length;
    targetHours = workDaysInMonth * (settings?.dailyHours || 8);

    const monthlyStats: MonthlyStatistics = {
      userId,
      year,
      month,
      totalHours: this.roundToQuarterHour(totalHours),
      targetHours: this.roundToQuarterHour(targetHours),
      overtimeHours: this.roundToQuarterHour(totalHours - targetHours),
      weeklyBreakdown,
      billableHours: this.roundToQuarterHour(billableHours),
      nonBillableHours: this.roundToQuarterHour(nonBillableHours),
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
