import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { berlinDayStart, shiftDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { currentPeriod, isPeriodKind, parsePeriod } from "@/lib/reports/period";
import {
  buildProjectsReport,
  EXCLUDED_PROJECT_SOURCES,
  PROJECT_ENTRY_TYPES,
  reportLoadRange,
} from "@/lib/reports/projects";

// GET /api/reports/projects?period=month|quarter|year&key=2026-10|2026-Q4|2026
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const kind = params.get("period") ?? "month";
  if (!isPeriodKind(kind)) {
    return NextResponse.json(
      { error: "Zeitraum muss month, quarter oder year sein" },
      { status: 400 },
    );
  }
  const key = params.get("key");
  const period = key ? parsePeriod(kind, key) : currentPeriod(kind);
  if (!period) {
    return NextResponse.json(
      { error: "Ungültiger Zeitraum (z. B. 2026-10, 2026-Q4 oder 2026)" },
      { status: 400 },
    );
  }

  try {
    const now = new Date();
    const range = reportLoadRange(period, now);
    // ±1 Tag Puffer: entscheidend ist der Berliner Tag des Starts, nicht die date-Spalte
    const rows = await prisma.timeEntry.findMany({
      where: {
        userId: session.user.id,
        type: { in: [...PROJECT_ENTRY_TYPES] },
        source: { notIn: [...EXCLUDED_PROJECT_SOURCES] },
        date: {
          gte: berlinDayStart(shiftDateKey(range.firstKey, -1)),
          lte: berlinDayStart(shiftDateKey(range.lastKey, 1)),
        },
      },
      select: {
        startTime: true,
        endTime: true,
        duration: true,
        type: true,
        source: true,
        projectPath: true,
        description: true,
      },
    });

    return NextResponse.json(
      buildProjectsReport(
        rows.map((row) => ({ ...row, duration: row.duration.toNumber() })),
        period,
        now,
      ),
    );
  } catch (error) {
    console.error("Projekt-Report konnte nicht erstellt werden:", error);
    return NextResponse.json(
      { error: "Projekt-Report konnte nicht erstellt werden" },
      { status: 500 },
    );
  }
}
