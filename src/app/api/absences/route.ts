import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  type AbsenceBlocksResponse,
  buildAbsenceBlocks,
  LOOSE_ENTRY_TYPES,
  type LooseEntryType,
} from "@/lib/absences/blocks";
import { auth } from "@/lib/auth";
import {
  berlinDayStart,
  berlinTodayKey,
  dateKeyFromDbDate,
  yearsOfRange,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { dailyTargetHours } from "@/lib/reports/absences";
import { loadHolidays } from "@/lib/reports/forecast-data";
import { getUserSettings } from "@/services/settings.service";

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

// GET /api/absences?year=YYYY – Blöcke für die Liste „Abwesenheiten {Jahr}“:
// alle Abwesenheiten, die das Jahr berühren (auch stornierte), plus lose
// Abwesenheitseinträge ohne verknüpfte Abwesenheit, zu Blöcken zusammengefasst.
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
  const yearStart = berlinDayStart(`${year}-01-01`);
  const yearEnd = berlinDayStart(`${year}-12-31`);

  try {
    const [settings, absences, looseEntries] = await Promise.all([
      getUserSettings(userId),
      prisma.absence.findMany({
        // Überschneidung mit dem Jahr, auch über den Jahreswechsel
        where: {
          userId,
          startDate: { lte: yearEnd },
          endDate: { gte: yearStart },
        },
        select: {
          id: true,
          source: true,
          kind: true,
          startDate: true,
          endDate: true,
          halfDay: true,
          status: true,
        },
        orderBy: { startDate: "asc" },
      }),
      prisma.timeEntry.findMany({
        where: {
          userId,
          absenceId: null,
          type: { in: [...LOOSE_ENTRY_TYPES] },
          source: { not: "ADJUSTMENT" },
          date: { gte: yearStart, lte: yearEnd },
        },
        select: { date: true, type: true, duration: true, source: true },
      }),
    ]);

    const absenceRows = absences.map((absence) => ({
      id: absence.id,
      source: absence.source,
      kind: absence.kind,
      startDate: dateKeyFromDbDate(absence.startDate),
      endDate: dateKeyFromDbDate(absence.endDate),
      halfDay: absence.halfDay,
      status: absence.status,
    }));

    // Feiertage für alle Jahre, die die Abwesenheiten berühren
    const years = new Set<number>([year]);
    for (const row of absenceRows) {
      for (const y of yearsOfRange(row.startDate, row.endDate)) years.add(y);
    }
    const holidays = await loadHolidays(userId, [...years]);

    const weeklyWorkHours = Number(settings.weeklyWorkHours);
    const blocks = buildAbsenceBlocks({
      workDays: settings.workDays,
      holidays: holidays.allKeys,
      dailyHours: dailyTargetHours(weeklyWorkHours, settings.workDays),
      todayKey,
      absences: absenceRows,
      looseEntries: looseEntries.map((entry) => ({
        dateKey: dateKeyFromDbDate(entry.date),
        type: entry.type as LooseEntryType,
        hours: Number(entry.duration),
        source: entry.source,
      })),
    });

    const body: AbsenceBlocksResponse = { year, todayKey, blocks };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Abwesenheiten konnten nicht geladen werden:", error);
    return NextResponse.json(
      { error: "Abwesenheiten konnten nicht geladen werden" },
      { status: 500 },
    );
  }
}
