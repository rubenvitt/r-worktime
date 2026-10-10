import { EntryType } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  berlinDayStart,
  berlinTodayKey,
  dateKeyFromDbDate,
  shiftDateKey,
  yearsOfRange,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  analyzePatterns,
  type PatternsResponse,
  parsePatternPeriod,
  resolvePatternRange,
} from "@/lib/reports/patterns";
import { loadOfficialHolidays } from "@/services/holiday.service";

// GET /api/reports/patterns?period=month|quarter|year&key=2026-10|2026-Q4|2026
//   | period=last90
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const userId = session.user.id;

  const period = parsePatternPeriod(request.nextUrl.searchParams);
  if (!period) {
    return NextResponse.json({ error: "Ungültiger Zeitraum" }, { status: 400 });
  }
  const range = resolvePatternRange(period, berlinTodayKey());

  try {
    const empty = range.isEmpty;
    const [entries, holidayEntries, official] = empty
      ? [[], [], { names: {}, unavailableYears: [] }]
      : await Promise.all([
          // Puffer: Vortag für die Ruhezeit (§5), Folgetag für Arbeit nach Mitternacht
          prisma.timeEntry.findMany({
            where: {
              userId,
              type: { in: [EntryType.WORK, EntryType.OVERTIME] },
              date: {
                gte: berlinDayStart(shiftDateKey(range.from, -1)),
                lte: berlinDayStart(shiftDateKey(range.effectiveTo, 1)),
              },
            },
            select: {
              startTime: true,
              endTime: true,
              type: true,
              source: true,
              description: true,
            },
          }),
          prisma.timeEntry.findMany({
            where: {
              userId,
              type: EntryType.HOLIDAY,
              date: {
                gte: berlinDayStart(range.from),
                lte: berlinDayStart(range.effectiveTo),
              },
            },
            select: { date: true, description: true, title: true },
          }),
          // § 9 gilt an jedem Feiertag, auch am Samstag: alle offiziellen
          loadOfficialHolidays(yearsOfRange(range.from, range.effectiveTo)),
        ]);

    // Offizielle Feiertage plus importierte; ohne Feiertags-Dienst nur importierte
    const holidays: Record<string, string> = {};
    for (const [key, name] of Object.entries(official.names)) {
      if (key >= range.from && key <= range.effectiveTo) holidays[key] = name;
    }
    for (const holiday of holidayEntries) {
      holidays[dateKeyFromDbDate(holiday.date)] ??=
        holiday.title || holiday.description || "Feiertag";
    }

    const report = analyzePatterns(entries, {
      from: range.from,
      to: range.effectiveTo,
      holidays,
    });
    const body: PatternsResponse = {
      ...report,
      period,
      range,
      holidayCount: Object.keys(holidays).length,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Arbeitszeitmuster konnten nicht berechnet werden:", error);
    return NextResponse.json(
      { error: "Arbeitszeitmuster konnten nicht berechnet werden" },
      { status: 500 },
    );
  }
}
