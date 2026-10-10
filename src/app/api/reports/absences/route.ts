import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { berlinDayStart, berlinTodayKey, dateKeyFromDbDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  type AbsenceEntryType,
  buildAbsenceReport,
} from "@/lib/reports/absences";
import { getUserSettings } from "@/services/settings.service";

const ABSENCE_TYPES: AbsenceEntryType[] = ["VACATION", "SICK", "HOLIDAY"];

const yearSchema = z
  .string()
  .regex(/^\d{4}$/, "Jahr im Format JJJJ erwartet")
  .transform(Number)
  .pipe(
    z
      .number()
      .min(2000, "Jahr muss zwischen 2000 und 2100 liegen")
      .max(2100, "Jahr muss zwischen 2000 und 2100 liegen"),
  );

// GET /api/reports/absences?year=YYYY
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const userId = session.user.id;

  const todayKey = berlinTodayKey();
  const rawYear = request.nextUrl.searchParams.get("year");
  const parsed = yearSchema.safeParse(rawYear ?? todayKey.slice(0, 4));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültiges Jahr" },
      { status: 400 },
    );
  }
  const year = parsed.data;
  const range = {
    gte: berlinDayStart(`${year}-01-01`),
    lte: berlinDayStart(`${year}-12-31`),
  };

  try {
    const [settings, entries, reviewedDays, workedDays] = await Promise.all([
      getUserSettings(userId),
      prisma.timeEntry.findMany({
        where: {
          userId,
          type: { in: ABSENCE_TYPES },
          source: { not: "ADJUSTMENT" },
          date: range,
        },
        select: { date: true, type: true, duration: true },
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
    ]);

    const report = buildAbsenceReport({
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
      })),
      reviewedDays: reviewedDays.map((day) => ({
        dateKey: dateKeyFromDbDate(day.date),
        reason: day.reason,
      })),
      workedDateKeys: workedDays.map((day) => dateKeyFromDbDate(day.date)),
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error("Abwesenheitsbericht konnte nicht erstellt werden:", error);
    return NextResponse.json(
      { error: "Abwesenheitsbericht konnte nicht erstellt werden" },
      { status: 500 },
    );
  }
}
