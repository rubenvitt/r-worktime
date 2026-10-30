import type { Prisma } from "@prisma/client";
import { startOfDay } from "date-fns";
import {
  berlinDateKey,
  berlinDayStart,
  berlinTodayKey,
  dateKeyFromDbDate,
  shiftDateKey,
  weekdayOfKey,
  yearsOfRange,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { loadOfficialHolidays } from "@/services/holiday.service";
import type {
  DateRange,
  ProblemDay,
  ProblemFilters,
  ProblemStats,
  ReviewedDay,
  TimeEntry,
} from "@/types/problem";

export class ProblemDetectionService {
  private readonly DEFAULT_WEEKLY_HOURS = 40;

  async findProblematicDays(
    userId: string,
    filters?: ProblemFilters,
  ): Promise<{ problems: ProblemDay[]; stats: ProblemStats }> {
    // Tage als Berliner Kalendertage, unabhängig von der Serverzeit
    const { fromKey, toKey } = filters?.dateRange
      ? {
          fromKey: berlinDateKey(filters.dateRange.startDate),
          toKey: berlinDateKey(filters.dateRange.endDate),
        }
      : this.getDefaultDayRange();
    const dateFilter = {
      gte: berlinDayStart(fromKey),
      lte: berlinDayStart(toKey),
    };

    // Hole alle Zeiteinträge, geprüften Tage, Einstellungen und offiziellen
    // Feiertage im Zeitraum
    const [entries, reviewedDays, userSettings, official] = await Promise.all([
      prisma.timeEntry.findMany({
        where: { userId, date: dateFilter },
        orderBy: { date: "desc" },
      }),
      prisma.reviewedDay.findMany({
        where: { userId, date: dateFilter },
      }),
      prisma.userSettings.findUnique({
        where: { userId },
      }),
      fromKey <= toKey
        ? loadOfficialHolidays(yearsOfRange(fromKey, toKey))
        : Promise.resolve({ names: {}, unavailableYears: [] }),
    ]);

    const weeklyWorkHours = userSettings?.weeklyWorkHours
      ? Number(userSettings.weeklyWorkHours)
      : this.DEFAULT_WEEKLY_HOURS;
    const workDays = new Set(
      userSettings?.workDays?.length ? userSettings.workDays : [1, 2, 3, 4, 5],
    );
    // Tagessoll wie im Saldo: Wochenstunden / Anzahl Arbeitstage
    const dailyWorkHours = weeklyWorkHours / workDays.size;

    const entriesByKey = new Map<string, typeof entries>();
    for (const entry of entries) {
      const key = dateKeyFromDbDate(entry.date);
      const list = entriesByKey.get(key) ?? [];
      list.push(entry);
      entriesByKey.set(key, list);
    }
    const reviewedKeys = new Set(
      reviewedDays.map((r) => dateKeyFromDbDate(r.date)),
    );
    // Feiertag = offiziell (Feiertags-Dienst) oder importiert (HOLIDAY-Eintrag);
    // ohne Dienst bleiben die importierten
    const holidayKeys = new Set(Object.keys(official.names));
    for (const entry of entries) {
      if (entry.type === "HOLIDAY") {
        holidayKeys.add(dateKeyFromDbDate(entry.date));
      }
    }

    // Analysiere jeden Tag im Zeitraum
    const problems: ProblemDay[] = [];
    const stats: ProblemStats = {
      totalProblems: 0,
      missingDays: 0,
      zeroHoursDays: 0,
      incompleteDays: 0,
    };

    for (let key = fromKey; key <= toKey; key = shiftDateKey(key, 1)) {
      const dayEntries = entriesByKey.get(key) ?? [];

      // Skip reviewed days unless showing all
      if (reviewedKeys.has(key) && filters?.reviewStatus === "unreviewed") {
        continue;
      }

      const weekday = weekdayOfKey(key);
      const weekend = weekday === 0 || weekday === 6;
      const holiday = holidayKeys.has(key);
      // Kein Soll: freier Tag laut Einstellungen oder Feiertag
      const noTarget = !workDays.has(weekday) || holiday;

      // Skip days without target unless they have entries
      if (noTarget && dayEntries.length === 0) continue;

      const totalHours = dayEntries.reduce(
        (sum, entry) => sum + Number(entry.duration),
        0,
      );

      // Überstundenabbau und unbezahlte Abwesenheit sind keine fehlenden Tage,
      // auch mit 0 h; ihre Stunden zählen wie Arbeit zur Abdeckung des Tags
      const hasLeave = dayEntries.some(
        (entry) =>
          entry.type === "OVERTIME_REDUCTION" || entry.type === "UNPAID_LEAVE",
      );

      let problemType: ProblemDay["type"] | null = null;

      if (dayEntries.length === 0) {
        problemType = "missing";
        stats.missingDays++;
      } else if (hasLeave && totalHours === 0) {
        problemType = null;
      } else if (totalHours === 0 && !holiday) {
        // Ein 0-h-Feiertagseintrag ist kein Problem
        problemType = "zero_hours";
        stats.zeroHoursDays++;
      } else if (totalHours < dailyWorkHours && !noTarget) {
        problemType = "incomplete";
        stats.incompleteDays++;
      }

      // Apply filter
      if (
        problemType &&
        (filters?.problemType === "all" ||
          filters?.problemType === problemType ||
          !filters?.problemType)
      ) {
        const problem: ProblemDay = {
          date: berlinDayStart(key),
          type: problemType,
          currentHours: totalHours,
          expectedHours: noTarget ? 0 : dailyWorkHours,
          entries: dayEntries.map((e) => ({
            ...e,
            duration: Number(e.duration),
          })) as TimeEntry[],
          isWeekend: weekend,
          isHoliday: holiday,
          suggestion: this.getSuggestion(
            problemType,
            dayEntries.length,
            noTarget,
            holiday,
          ),
        };

        problems.push(problem);
        stats.totalProblems++;
      }
    }

    // Apply sorting
    if (filters?.sortBy) {
      problems.sort((a, b) => {
        switch (filters.sortBy) {
          case "date_asc":
            return a.date.getTime() - b.date.getTime();
          case "date_desc":
            return b.date.getTime() - a.date.getTime();
          case "type":
            return a.type.localeCompare(b.type);
          default:
            return 0;
        }
      });
    }

    return { problems, stats };
  }

  private getSuggestion(
    type: ProblemDay["type"],
    entryCount: number,
    isWeekend: boolean,
    isHoliday: boolean,
  ): ProblemDay["suggestion"] {
    if (type === "missing" && (isWeekend || isHoliday)) {
      return "review";
    }
    if (type === "missing" && entryCount === 0) {
      return "add_entry";
    }
    if (type === "incomplete") {
      return "add_entry";
    }
    return "bulk_fill";
  }

  /** Die letzten 30 Tage bis heute (Berliner Kalendertage). */
  private getDefaultDayRange(): { fromKey: string; toKey: string } {
    const toKey = berlinTodayKey();
    return { fromKey: shiftDateKey(toKey, -30), toKey };
  }

  async markAsReviewed(
    userId: string,
    date: Date,
    reason?: string,
  ): Promise<void> {
    // Erneut prüfen (z. B. mit anderem Grund) überschreibt den alten Stand
    await prisma.reviewedDay.upsert({
      where: { userId_date: { userId, date: startOfDay(date) } },
      update: { reason, reviewedAt: new Date() },
      create: {
        userId,
        date: startOfDay(date),
        reason,
        reviewedAt: new Date(),
      },
    });
  }

  async markMultipleAsReviewed(
    userId: string,
    dates: Date[],
    reason?: string,
  ): Promise<void> {
    const data = dates.map((date) => ({
      userId,
      date: startOfDay(date),
      reason,
      reviewedAt: new Date(),
    }));

    await prisma.reviewedDay.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async getReviewedDays(
    userId: string,
    range?: DateRange,
  ): Promise<ReviewedDay[]> {
    const where: Prisma.ReviewedDayWhereInput = { userId };

    if (range) {
      where.date = {
        gte: range.startDate,
        lte: range.endDate,
      };
    }

    const reviewedDays = await prisma.reviewedDay.findMany({
      where,
      orderBy: { date: "desc" },
    });

    return reviewedDays.map((day) => ({
      ...day,
      reason: day.reason || undefined,
    })) as ReviewedDay[];
  }

  async unreviewDay(userId: string, date: Date): Promise<void> {
    await prisma.reviewedDay.deleteMany({
      where: {
        userId,
        date: startOfDay(date),
      },
    });
  }
}
