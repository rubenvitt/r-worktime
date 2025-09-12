import { EntryType as PrismaEntryType } from "@prisma/client";
import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isWeekend,
  setWeek,
  setYear,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { de } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import type { EntryType } from "@/types/database";
import type { DayData, WeekData, WeekSummary } from "@/types/statistics";

export class WeekService {
  private static instance: WeekService;
  private readonly DEFAULT_DAILY_HOURS = 8;
  private readonly DEFAULT_WEEKLY_HOURS = 40;

  private constructor() {}

  static getInstance(): WeekService {
    if (!WeekService.instance) {
      WeekService.instance = new WeekService();
    }
    return WeekService.instance;
  }

  private async getUserSettings(userId: string): Promise<{
    weeklyHours: number;
    dailyHours: number;
    workDays: number[];
  }> {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      return {
        weeklyHours: this.DEFAULT_WEEKLY_HOURS,
        dailyHours: this.DEFAULT_DAILY_HOURS,
        workDays: [1, 2, 3, 4, 5], // Default: Montag bis Freitag
      };
    }

    const workDaysCount = settings.workDays.length || 5;
    return {
      weeklyHours: Number(settings.weeklyWorkHours),
      dailyHours: Number(settings.weeklyWorkHours) / workDaysCount,
      workDays: settings.workDays || [1, 2, 3, 4, 5],
    };
  }

  private getWeekDateRange(
    year: number,
    week: number,
  ): { start: Date; end: Date } {
    // Erstelle ein Datum für die gewünschte Woche
    let date = new Date(year, 0, 1); // 1. Januar des Jahres
    date = setYear(date, year);
    date = setWeek(date, week);

    // Hole Start und Ende der Woche (Montag bis Sonntag)
    const start = startOfWeek(date, { weekStartsOn: 1 }); // Montag als Wochenstart
    const end = endOfWeek(date, { weekStartsOn: 1 });

    return { start, end };
  }

  async getWeekData(
    userId: string,
    year: number,
    week: number,
  ): Promise<WeekData> {
    const { start, end } = this.getWeekDateRange(year, week);
    const userSettings = await this.getUserSettings(userId);

    // Hole alle TimeEntries für die Woche
    const entries = await prisma.timeEntry.findMany({
      where: {
        userId,
        date: {
          gte: start,
          lte: end,
        },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    // Erstelle eine Map für schnellen Zugriff auf Einträge pro Tag
    const entriesByDate = new Map<string, typeof entries>();
    entries.forEach((entry) => {
      const dateKey = format(entry.date, "yyyy-MM-dd");
      if (!entriesByDate.has(dateKey)) {
        entriesByDate.set(dateKey, []);
      }
      entriesByDate.get(dateKey)?.push(entry);
    });

    // Erstelle Daten für jeden Tag der Woche
    const days = eachDayOfInterval({ start, end });
    const dailyData: DayData[] = days.map((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      const dayEntries = entriesByDate.get(dateKey) || [];

      // Berechne Arbeitsstunden für den Tag
      const workHours = dayEntries
        .filter(
          (e) =>
            e.type === PrismaEntryType.WORK ||
            e.type === PrismaEntryType.OVERTIME,
        )
        .reduce((sum, e) => sum + Number(e.duration), 0);

      // Berechne Soll-Stunden (0 für Wochenenden)
      const targetHours = isWeekend(day) ? 0 : userSettings.dailyHours;

      // Berechne Differenz
      const difference = workHours - targetHours;

      return {
        date: day,
        dayOfWeek: format(day, "EEEE", { locale: de }),
        entries: dayEntries.map((e) => ({
          id: e.id,
          startTime: e.startTime,
          endTime: e.endTime,
          duration: Number(e.duration),
          type: e.type as EntryType,
          description: e.description,
        })),
        totalHours: workHours,
        targetHours,
        difference,
        isWeekend: isWeekend(day),
      };
    });

    // Berechne Wochensummen
    const weekSummary: WeekSummary = {
      totalWorkHours: dailyData.reduce((sum, day) => sum + day.totalHours, 0),
      targetHours: userSettings.weeklyHours,
      weekBalance: 0, // wird unten berechnet
      cumulativeBalance: 0, // wird unten berechnet
    };

    weekSummary.weekBalance =
      weekSummary.totalWorkHours - weekSummary.targetHours;

    // Berechne kumulierten Saldo bis zu dieser Woche
    weekSummary.cumulativeBalance = await this.calculateCumulativeBalance(
      userId,
      year,
      week,
    );

    return {
      year,
      week,
      weekStartDate: start,
      weekEndDate: end,
      days: dailyData,
      summary: weekSummary,
    };
  }

  private async calculateCumulativeBalance(
    userId: string,
    year: number,
    week: number,
  ): Promise<number> {
    const userSettings = await this.getUserSettings(userId);
    const yearStart = startOfYear(new Date(year, 0, 1));
    const { end: weekEnd } = this.getWeekDateRange(year, week);

    // Hole alle Arbeitsstunden bis zum Ende der angegebenen Woche
    const entries = await prisma.timeEntry.findMany({
      where: {
        userId,
        date: {
          gte: yearStart,
          lte: weekEnd,
        },
        type: {
          in: [PrismaEntryType.WORK, PrismaEntryType.OVERTIME],
        },
      },
      select: {
        duration: true,
        date: true,
      },
    });

    // Berechne gesamte Arbeitsstunden
    const totalWorkedHours = entries.reduce(
      (sum, e) => sum + Number(e.duration),
      0,
    );

    // Berechne Anzahl der Arbeitswochen bis zur angegebenen Woche
    const weeksWorked = week;
    const totalTargetHours = weeksWorked * userSettings.weeklyHours;

    // Kumulierter Saldo = Gearbeitete Stunden - Soll-Stunden
    return totalWorkedHours - totalTargetHours;
  }
}

// Export singleton instance
export const weekService = WeekService.getInstance();
