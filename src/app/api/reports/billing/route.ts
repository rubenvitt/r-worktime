import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  berlinDayStart,
  berlinTodayKey,
  monthRange,
  shiftDateKey,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { buildBillingReport, parseBillingQuery } from "@/lib/reports/billing";
import { periodBounds, trendWindow } from "@/lib/reports/period";
import { WORK_TYPES } from "@/lib/timesheet/entries";

// GET /api/reports/billing?period=month|quarter|year&key=2026-10&depth=1
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const todayKey = berlinTodayKey();
  const query = parseBillingQuery(request.nextUrl.searchParams, todayKey);
  if (!query.success) {
    return NextResponse.json({ error: query.error }, { status: 400 });
  }

  const { period, depth } = query.data;
  // Ein Abfragefenster für Zeitraum und 12-Monats-Verlauf; ±1 Tag Puffer,
  // weil der Berliner Tag des Starts zählt, nicht die date-Spalte
  const { firstKey: periodFirst, lastKey } = periodBounds(period);
  const trendFirst = monthRange(trendWindow(period, todayKey)[0]).firstKey;
  const firstKey = trendFirst < periodFirst ? trendFirst : periodFirst;

  try {
    const rows = await prisma.timeEntry.findMany({
      where: {
        userId: session.user.id,
        type: { in: [...WORK_TYPES] },
        source: { not: "ADJUSTMENT" },
        date: {
          gte: berlinDayStart(shiftDateKey(firstKey, -1)),
          lte: berlinDayStart(shiftDateKey(lastKey, 1)),
        },
      },
      select: {
        startTime: true,
        duration: true,
        type: true,
        source: true,
        description: true,
        billingStatus: true,
        projectPath: true,
      },
    });

    const report = buildBillingReport(
      rows.map((row) => ({ ...row, duration: row.duration.toNumber() })),
      { period, depth, todayKey },
    );
    return NextResponse.json(report);
  } catch (error) {
    console.error("Abrechnungsbericht konnte nicht erstellt werden:", error);
    return NextResponse.json(
      { error: "Abrechnungsbericht konnte nicht erstellt werden" },
      { status: 500 },
    );
  }
}
