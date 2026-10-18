// Abwesenheitsbericht eines Jahres aus der DB – Quelle für Berichte ›
// Abwesenheiten und den Urlaubsplaner.

import { berlinDayStart, dateKeyFromDbDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  type AbsenceEntryType,
  type AbsenceReport,
  buildAbsenceReport,
} from "@/lib/reports/absences";
import { loadOfficialHolidays } from "@/lib/reports/forecast-data";
import { getUserSettings } from "@/services/settings.service";

const ABSENCE_TYPES: AbsenceEntryType[] = [
  "VACATION",
  "SICK",
  "HOLIDAY",
  "OVERTIME_REDUCTION",
  "UNPAID_LEAVE",
];

export async function loadAbsenceReport(
  userId: string,
  year: number,
  todayKey: string,
): Promise<AbsenceReport> {
  const range = {
    gte: berlinDayStart(`${year}-01-01`),
    lte: berlinDayStart(`${year}-12-31`),
  };

  const [settings, entries, reviewedDays, workedDays, official] =
    await Promise.all([
      getUserSettings(userId),
      prisma.timeEntry.findMany({
        where: {
          userId,
          type: { in: ABSENCE_TYPES },
          source: { not: "ADJUSTMENT" },
          date: range,
        },
        // Art der verknüpften Abwesenheit: entscheidet über das Urlaubskonto
        select: {
          date: true,
          type: true,
          duration: true,
          absence: { select: { kind: true } },
        },
      }),
      prisma.reviewedDay.findMany({
        where: { userId, date: range, reason: { not: null } },
        select: { date: true, reason: true },
      }),
      // Tage mit Arbeit: dort zählt ein geprüfter „Unbezahlter Urlaub“ nicht
      prisma.timeEntry.findMany({
        where: {
          userId,
          type: { in: ["WORK", "OVERTIME"] },
          source: { not: "ADJUSTMENT" },
          date: range,
        },
        select: { date: true },
        distinct: ["date"],
      }),
      // Offizielle Feiertage wie in der Prognose, auch ohne Import
      loadOfficialHolidays([year]),
    ]);

  return buildAbsenceReport({
    year,
    todayKey,
    settings: {
      weeklyWorkHours: settings.weeklyWorkHours,
      workDays: settings.workDays,
      annualVacationDays: settings.annualVacationDays,
    },
    entries: entries.map((entry) => ({
      dateKey: dateKeyFromDbDate(entry.date),
      type: entry.type as AbsenceEntryType,
      hours: Number(entry.duration),
      kind: entry.absence?.kind ?? null,
    })),
    reviewedDays: reviewedDays.map((day) => ({
      dateKey: dateKeyFromDbDate(day.date),
      reason: day.reason,
    })),
    workedDateKeys: workedDays.map((day) => dateKeyFromDbDate(day.date)),
    holidays: official.names,
    holidayServiceUnavailable: official.unavailableYears.length > 0,
  });
}
