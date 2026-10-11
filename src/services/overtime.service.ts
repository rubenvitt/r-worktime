import { excludeAdjustmentFilter, findAdjustmentEntry } from "@/lib/adjustment";
import {
  berlinDateKey,
  berlinDayStart,
  berlinTodayKey,
  dateKeyFromDbDate,
  type IsoWeek,
  isoWeekOf,
  isoWeekRange,
  monthRange,
  shiftDateKey,
  yearsOfRange,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { splitHoursByBillingClass } from "@/lib/reports/billing";
import {
  absenceCreditHours,
  dayTargetHours,
  type ReportEntry,
  type ReportEntryType,
  summarizeRange,
  type WorkSchedule,
} from "@/lib/reports/year";
import { loadOfficialHolidays } from "@/services/holiday.service";
import { EntryType } from "@/types/database";
import type {
  CacheEntry,
  DailyStatistics,
  MonthlyStatistics,
  OvertimeBalance,
  OvertimeCalculationParams,
  WeeklyStatistics,
} from "@/types/statistics";

/** Zeile der time_entries-Tabelle, soweit die Rechnung sie braucht. */
interface EntryRow {
  date: Date;
  duration: { toNumber(): number };
  type: string;
  source?: string | null;
  billingStatus?: string | null;
}

function toReportEntry(row: EntryRow): ReportEntry {
  return {
    date: dateKeyFromDbDate(row.date),
    hours: row.duration.toNumber(),
    type: row.type as ReportEntryType,
    source: row.source ?? "",
    billingStatus: row.billingStatus ?? null,
  };
}

/**
 * Kalendertag eines Zeitraum-Parameters: @db.Date-Werte und Routen-Parameter
 * wie "2026-03-30" sind UTC-Mitternacht des Tags, andere Zeitpunkte (z. B.
 * `new Date()`) zählen mit ihrem Berliner Kalendertag.
 */
function dayKeyOfParam(date: Date): string {
  const isUtcMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;
  return isUtcMidnight ? dateKeyFromDbDate(date) : berlinDateKey(date);
}

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

  /**
   * Feiertage im Zeitraum: offizielle aus dem Feiertags-Dienst plus
   * importierte HOLIDAY-Einträge. Ist der Dienst nicht erreichbar, bleiben
   * nur die importierten (der Dienst meldet das selbst im Log).
   */
  private async loadHolidayKeys(
    fromKey: string,
    toKey: string,
    entries: readonly ReportEntry[],
  ): Promise<{ keys: Set<string>; unavailable: boolean }> {
    const keys = new Set<string>();
    if (fromKey > toKey) return { keys, unavailable: false };
    const official = await loadOfficialHolidays(yearsOfRange(fromKey, toKey));
    for (const key of Object.keys(official.names)) {
      if (key >= fromKey && key <= toKey) keys.add(key);
    }
    for (const entry of entries) {
      if (entry.type === "HOLIDAY") keys.add(entry.date);
    }
    return { keys, unavailable: official.unavailableYears.length > 0 };
  }

  private scheduleOf(settings: {
    dailyHours: number;
    workDays: number[];
  }): WorkSchedule {
    return { workDays: settings.workDays, dailyHours: settings.dailyHours };
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

    // Zeitraum als Berliner Kalendertage. Mit Anfangssaldo zählen Soll und
    // Ist erst ab dem Tag NACH dem Adjustment – der Anfangssaldo deckt seinen
    // eigenen Tag schon ab.
    const todayKey = berlinTodayKey();
    let fromKey = startDate
      ? dayKeyOfParam(startDate)
      : `${todayKey.slice(0, 4)}-01-01`;
    let initialBalance = 0;

    if (adjustmentEntry) {
      const dayAfterAdjustment = shiftDateKey(
        dateKeyFromDbDate(adjustmentEntry.date),
        1,
      );
      if (!startDate || fromKey < dayAfterAdjustment) {
        fromKey = dayAfterAdjustment;
      }
      // Der Anfangssaldo selbst (z.B. 0 bedeutet: bis zu diesem Tag genau Sollzeit gearbeitet)
      initialBalance = adjustmentEntry.duration.toNumber();
    }

    const toKey = endDate ? dayKeyOfParam(endDate) : todayKey;

    const rows =
      fromKey <= toKey
        ? await prisma.timeEntry.findMany({
            where: {
              userId,
              date: {
                gte: berlinDayStart(fromKey),
                lte: berlinDayStart(toKey),
              },
              // Anfangssaldo ausschließen, Einträge ohne description behalten
              ...excludeAdjustmentFilter(),
            },
            orderBy: { date: "asc" },
          })
        : [];
    const entries = rows.map(toReportEntry);
    const holidays = await this.loadHolidayKeys(fromKey, toKey, entries);

    // Dieselbe Tagesregel wie Jahresübersicht und Prognose: Soll an
    // Arbeitstagen ohne Feiertag, Arbeit je Eintrag gerundet, Urlaub/Krank je
    // Tag summiert und höchstens bis zum Tagessoll gutgeschrieben.
    const summary = summarizeRange(entries, {
      from: fromKey,
      to: toKey,
      schedule: this.scheduleOf(settings),
      holidayKeys: holidays.keys,
    });
    const actualHours = summary.actualHours;
    const targetHours = summary.targetHours;

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

    const reportEntries = entries.map(toReportEntry);
    const holidays = await this.loadHolidayKeys(
      range.firstKey,
      range.lastKey,
      reportEntries,
    );
    const schedule = this.scheduleOf(settings);

    // Tage nach derselben Regel wie der Saldo (summarizeRange je Tag)
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
      const dayEntries = reportEntries.filter((e) => e.date === dateKey);
      const day = summarizeRange(dayEntries, {
        from: dateKey,
        to: dateKey,
        schedule,
        holidayKeys: holidays.keys,
      });
      // Gutschrift wie im Abwesenheiten-Bericht verteilt: Krankheit vor
      // Urlaub; unbezahlte Stunden mindern das Soll wie in summarizeRange
      const sumOf = (type: ReportEntryType) =>
        dayEntries
          .filter((e) => e.type === type && e.hours > 0)
          .reduce((sum, e) => sum + e.hours, 0);
      const unpaid = sumOf("UNPAID_LEAVE");
      const dayTarget = dayTargetHours(
        dateKey,
        schedule,
        holidays.keys,
        unpaid,
      );
      const sick = absenceCreditHours(sumOf("SICK"), dayTarget);
      const vacation = absenceCreditHours(sumOf("VACATION"), dayTarget - sick);
      const isHoliday = holidays.keys.has(dateKey);

      entryTypes.work += day.workHours;
      entryTypes.sick += sick;
      entryTypes.vacation += vacation;
      // Feiertag an einem Arbeitstag: das entfallene Tagessoll
      if (day.holidayDays > 0) entryTypes.holiday += schedule.dailyHours;

      let primaryType: EntryType = EntryType.WORK;
      if (isHoliday) primaryType = EntryType.HOLIDAY;
      else if (sick > 0) primaryType = EntryType.SICK;
      else if (vacation > 0) primaryType = EntryType.VACATION;
      else if (day.unpaidDays > 0) primaryType = EntryType.UNPAID_LEAVE;
      else if (day.overtimeReductionDays > 0)
        primaryType = EntryType.OVERTIME_REDUCTION;

      totalHours += day.actualHours;
      targetHours += day.targetHours;

      dailyBreakdown.push({
        date: berlinDayStart(dateKey),
        actualHours: this.roundToQuarterHour(day.actualHours),
        targetHours: day.targetHours,
        overtimeHours: this.roundToQuarterHour(
          day.actualHours - day.targetHours,
        ),
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

    // Soll und Ist nach derselben Tagesregel wie der Saldo; Feiertags-
    // Einträge und der Anfangssaldo zählen nicht als Ist
    const settings = await this.getUserSettings(userId);
    const schedule: WorkSchedule = settings
      ? this.scheduleOf(settings)
      : { workDays: [1, 2, 3, 4, 5], dailyHours: this.DEFAULT_DAILY_HOURS };
    const reportEntries = entries.map(toReportEntry);
    const holidays = await this.loadHolidayKeys(
      range.firstKey,
      range.lastKey,
      reportEntries,
    );
    const summary = summarizeRange(reportEntries, {
      from: range.firstKey,
      to: range.lastKey,
      schedule,
      holidayKeys: holidays.keys,
    });
    const totalHours = summary.actualHours;
    const targetHours = summary.targetHours;

    // Abrechnung nach Timing-Status; nur echte Arbeit (ohne Abwesenheiten
    // und Anfangssaldo). Einträge ohne Status zählen als „unbekannt“.
    const billing = splitHoursByBillingClass(
      entries.map((entry) => ({
        type: entry.type,
        source: entry.source,
        description: entry.description,
        billingStatus: entry.billingStatus,
        hours: this.roundToQuarterHour(entry.duration.toNumber()),
      })),
    );

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
