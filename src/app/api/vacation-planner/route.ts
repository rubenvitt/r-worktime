import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { allowedFeedHosts } from "@/lib/calendar/feed";
import { berlinDayStart, berlinTodayKey, dateKeyFromDbDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { loadHolidays } from "@/lib/reports/forecast-data";
import {
  type BookedDay,
  bookedDayFromReport,
  plannerYearAllowed,
  type VacationPlannerResponse,
} from "@/lib/vacation-planner";
import { loadAbsenceReport } from "@/services/absence-report.service";

// GET /api/vacation-planner?year=YYYY
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const userId = session.user.id;
  const todayKey = berlinTodayKey();
  const rawYear = request.nextUrl.searchParams.get("year");
  const year = rawYear ? Number(rawYear) : Number(todayKey.slice(0, 4));
  if (!/^\d{4}$/.test(String(year)) || !plannerYearAllowed(year, todayKey)) {
    return NextResponse.json(
      { error: "Geplant wird im Vorjahr, laufenden oder nächsten Jahr." },
      { status: 400 },
    );
  }

  try {
    const [report, holidays, drafts, calendar] = await Promise.all([
      loadAbsenceReport(userId, year, todayKey),
      // Nachbarjahre für Brücken über den Jahreswechsel
      loadHolidays(userId, [year - 1, year, year + 1]),
      prisma.vacationDraft.findMany({
        where: {
          userId,
          startDate: { lte: berlinDayStart(`${year}-12-31`) },
          endDate: { gte: berlinDayStart(`${year}-01-01`) },
        },
        orderBy: { startDate: "asc" },
      }),
      prisma.calendarIntegration.findUnique({
        where: { userId },
        select: { feedUrlEnc: true, lastSyncAt: true },
      }),
    ]);

    const body: VacationPlannerResponse = {
      year,
      todayKey,
      workDays: report.workDays,
      holidays: holidays.names,
      holidayServiceUnavailable:
        report.holidayServiceUnavailable ||
        holidays.unavailableYears.length > 0,
      booked: report.days
        .map(bookedDayFromReport)
        .filter((day): day is BookedDay => day !== null),
      account: {
        entitlement: report.account.entitlement,
        taken: report.account.taken,
        booked: report.account.planned,
      },
      drafts: drafts.map((draft) => ({
        id: draft.id,
        from: dateKeyFromDbDate(draft.startDate),
        to: dateKeyFromDbDate(draft.endDate),
        note: draft.note,
      })),
      timewarpUrl: `https://${allowedFeedHosts()[0]}`,
      calendarConfigured: Boolean(calendar?.feedUrlEnc),
      calendarLastSyncAt: calendar?.lastSyncAt?.toISOString() ?? null,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Urlaubsplaner konnte nicht geladen werden:", error);
    return NextResponse.json(
      { error: "Urlaubsplaner konnte nicht geladen werden" },
      { status: 500 },
    );
  }
}
