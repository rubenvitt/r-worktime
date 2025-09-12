import type { Prisma } from "@prisma/client";
import { addDays, endOfDay, format, isWeekend, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
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
    const range = filters?.dateRange || this.getDefaultDateRange();

    // Hole alle Zeiteinträge im Zeitraum
    const entries = await prisma.timeEntry.findMany({
      where: {
        userId,
        date: {
          gte: range.startDate,
          lte: range.endDate,
        },
      },
      orderBy: { date: "desc" },
    });

    // Hole reviewed days
    const reviewedDays = await prisma.reviewedDay.findMany({
      where: {
        userId,
        date: {
          gte: range.startDate,
          lte: range.endDate,
        },
      },
    });

    // Hole User Settings für Arbeitsstunden
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    const weeklyWorkHours = userSettings?.weeklyWorkHours
      ? Number(userSettings.weeklyWorkHours)
      : this.DEFAULT_WEEKLY_HOURS;
    const dailyWorkHours = weeklyWorkHours / 5;

    // Analysiere jeden Tag im Zeitraum
    const problems: ProblemDay[] = [];
    const stats: ProblemStats = {
      totalProblems: 0,
      missingDays: 0,
      zeroHoursDays: 0,
      incompleteDays: 0,
    };

    let currentDate = new Date(range.startDate);
    while (currentDate <= range.endDate) {
      const dayEntries = entries.filter(
        (e) =>
          format(e.date, "yyyy-MM-dd") === format(currentDate, "yyyy-MM-dd"),
      );

      const isReviewed = reviewedDays.some(
        (r) =>
          format(r.date, "yyyy-MM-dd") === format(currentDate, "yyyy-MM-dd"),
      );

      // Skip reviewed days unless showing all
      if (isReviewed && filters?.reviewStatus === "unreviewed") {
        currentDate = addDays(currentDate, 1);
        continue;
      }

      const weekend = isWeekend(currentDate);
      const holiday = await this.isHoliday(currentDate);

      // Skip weekends and holidays unless they have entries
      if ((weekend || holiday) && dayEntries.length === 0) {
        currentDate = addDays(currentDate, 1);
        continue;
      }

      const totalHours = dayEntries.reduce(
        (sum, entry) => sum + Number(entry.duration),
        0,
      );

      let problemType: ProblemDay["type"] | null = null;

      if (dayEntries.length === 0) {
        problemType = "missing";
        stats.missingDays++;
      } else if (totalHours === 0) {
        problemType = "zero_hours";
        stats.zeroHoursDays++;
      } else if (totalHours < dailyWorkHours && !weekend && !holiday) {
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
          date: new Date(currentDate),
          type: problemType,
          currentHours: totalHours,
          expectedHours: weekend || holiday ? 0 : dailyWorkHours,
          entries: dayEntries.map((e) => ({
            ...e,
            duration: Number(e.duration),
          })) as TimeEntry[],
          isWeekend: weekend,
          isHoliday: holiday,
          suggestion: this.getSuggestion(
            problemType,
            dayEntries.length,
            weekend,
            holiday,
          ),
        };

        problems.push(problem);
        stats.totalProblems++;
      }

      currentDate = addDays(currentDate, 1);
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

  private getDefaultDateRange(): DateRange {
    const endDate = endOfDay(new Date());
    const startDate = startOfDay(addDays(endDate, -30));
    return { startDate, endDate };
  }

  private async isHoliday(date: Date): Promise<boolean> {
    // Hier könnte eine Holiday API oder DB-Tabelle verwendet werden
    // Fürs Erste: nur hardcoded deutsche Feiertage
    const holidays = [
      "2025-01-01", // Neujahr
      "2025-04-18", // Karfreitag
      "2025-04-21", // Ostermontag
      "2025-05-01", // Tag der Arbeit
      "2025-05-29", // Christi Himmelfahrt
      "2025-06-09", // Pfingstmontag
      "2025-10-03", // Tag der Deutschen Einheit
      "2025-12-25", // 1. Weihnachtstag
      "2025-12-26", // 2. Weihnachtstag
    ];

    const dateStr = format(date, "yyyy-MM-dd");
    return holidays.includes(dateStr);
  }

  async markAsReviewed(
    userId: string,
    date: Date,
    reason?: string,
  ): Promise<void> {
    await prisma.reviewedDay.create({
      data: {
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
