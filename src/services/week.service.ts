import { EntryType as PrismaEntryType } from "@prisma/client";
import {
  berlinDayStart,
  dateKeyFromDbDate,
  isoWeekRange,
  weekdayOfKey,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { absenceCreditHours, dayTargetHours } from "@/lib/reports/year";
import { loadOfficialHolidays } from "@/services/holiday.service";
import type { EntryType } from "@/types/database";
import type { DayData, WeekData, WeekSummary } from "@/types/statistics";

const WEEKDAY_NAMES = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
] as const;

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

  async getWeekData(
    userId: string,
    year: number,
    week: number,
  ): Promise<WeekData> {
    // ISO-8601-Woche auf Berliner Kalendertagen; wirft bei ungültiger Woche
    const range = isoWeekRange(year, week);
    const { start, end } = range;
    // KW 53/KW 1 reichen über den Jahreswechsel: Feiertage beider Jahre laden.
    // Ist der Feiertags-Dienst nicht erreichbar, bleiben nur importierte übrig
    // (holidayServiceUnavailable).
    const years = [
      ...new Set(range.dayKeys.map((key) => Number(key.slice(0, 4)))),
    ];
    const [userSettings, official] = await Promise.all([
      this.getUserSettings(userId),
      loadOfficialHolidays(years),
    ]);

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
      const dateKey = dateKeyFromDbDate(entry.date);
      if (!entriesByDate.has(dateKey)) {
        entriesByDate.set(dateKey, []);
      }
      entriesByDate.get(dateKey)?.push(entry);
    });

    // Erstelle Daten für jeden Tag der Woche
    const dailyData: DayData[] = range.dayKeys.map((dateKey) => {
      const weekday = weekdayOfKey(dateKey);
      const isWeekend = weekday === 0 || weekday === 6;
      const dayEntries = entriesByDate.get(dateKey) || [];

      // Berechne Arbeitsstunden für den Tag
      const workHours = dayEntries
        .filter(
          (e) =>
            e.type === PrismaEntryType.WORK ||
            e.type === PrismaEntryType.OVERTIME,
        )
        .reduce((sum, e) => sum + Number(e.duration), 0);

      // Feiertag: importiert (HOLIDAY-Eintrag) oder nur offiziell bekannt
      const holidayEntry = dayEntries.find(
        (e) => e.type === PrismaEntryType.HOLIDAY,
      );
      const officialName = official.names[dateKey];
      const holiday =
        holidayEntry || officialName
          ? {
              name: officialName ?? holidayEntry?.description ?? "Feiertag",
              imported: Boolean(holidayEntry),
            }
          : null;

      // Soll wie im Saldo: Tagessoll an Arbeitstagen, offizielle und
      // importierte Feiertage mindern es. Der Feiertags-Eintrag selbst zählt
      // nicht als Arbeit.
      // Unbezahlte Abwesenheit mindert das Soll um ihre Stunden,
      // Überstundenabbau lässt es stehen und schreibt nichts gut.
      const holidayKeys = new Set(holiday ? [dateKey] : []);
      const unpaidHours = dayEntries
        .filter(
          (e) =>
            e.type === PrismaEntryType.UNPAID_LEAVE && Number(e.duration) > 0,
        )
        .reduce((sum, e) => sum + Number(e.duration), 0);
      const targetHours = dayTargetHours(
        dateKey,
        {
          workDays: userSettings.workDays,
          dailyHours: userSettings.dailyHours,
        },
        holidayKeys,
        unpaidHours,
      );

      // Urlaub/Krank wie im Saldo: je Tag summiert, höchstens bis zum Soll
      const absenceHours = absenceCreditHours(
        dayEntries
          .filter(
            (e) =>
              (e.type === PrismaEntryType.VACATION ||
                e.type === PrismaEntryType.SICK) &&
              Number(e.duration) > 0,
          )
          .reduce((sum, e) => sum + Number(e.duration), 0),
        targetHours,
      );

      // Differenz wie im Saldo: Arbeit + Gutschrift − Soll
      const difference = workHours + absenceHours - targetHours;

      return {
        date: berlinDayStart(dateKey),
        dayOfWeek: WEEKDAY_NAMES[weekday],
        entries: dayEntries.map((e) => ({
          id: e.id,
          startTime: e.startTime,
          endTime: e.endTime,
          duration: Number(e.duration),
          type: e.type as EntryType,
          description: e.description,
        })),
        totalHours: workHours,
        absenceHours,
        targetHours,
        difference,
        isWeekend,
        holiday,
      };
    });

    // Berechne Wochensummen
    const weekSummary: WeekSummary = {
      totalWorkHours: dailyData.reduce((sum, day) => sum + day.totalHours, 0),
      absenceHours: dailyData.reduce((sum, day) => sum + day.absenceHours, 0),
      targetHours: dailyData.reduce((sum, day) => sum + day.targetHours, 0),
      weekBalance: 0, // wird unten berechnet
      cumulativeBalance: 0, // wird unten berechnet
    };

    weekSummary.weekBalance =
      weekSummary.totalWorkHours +
      weekSummary.absenceHours -
      weekSummary.targetHours;

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
      holidayServiceUnavailable: official.unavailableYears.length > 0,
    };
  }

  private async calculateCumulativeBalance(
    userId: string,
    year: number,
    week: number,
  ): Promise<number> {
    const userSettings = await this.getUserSettings(userId);
    // Ab Montag der KW 1 des ISO-Wochenjahrs, damit „week“ Wochen gezählt werden
    const { start: yearStart } = isoWeekRange(year, 1);
    const { end: weekEnd } = isoWeekRange(year, week);

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
