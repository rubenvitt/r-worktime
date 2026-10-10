import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { berlinTodayKey, weekdayOfKey } from "@/lib/dates";
import {
  loadCurrentBalance,
  loadHolidays,
  loadReportContext,
  loadReportEntries,
} from "@/lib/reports/forecast-data";
import { buildYearReport, type YearReport } from "@/lib/reports/year";

const yearSchema = z.coerce
  .number()
  .int("Jahr muss eine ganze Zahl sein")
  .min(2000, "Jahr muss zwischen 2000 und 2100 liegen")
  .max(2100, "Jahr muss zwischen 2000 und 2100 liegen");

export interface YearReportResponse {
  report: YearReport;
  /** Anfangssaldo und sein Tag, für die Erläuterung */
  adjustment: { date: string; hours: number } | null;
  /** Aktueller Saldo wie auf /overtime – nur im laufenden Jahr */
  currentBalance: number | null;
  holidays: {
    /** Offizielle Feiertage auf gezählten Arbeitstagen ohne HOLIDAY-Eintrag */
    notImported: Array<{ date: string; name: string }>;
    unavailable: boolean;
  };
}

// GET /api/reports/year?year=YYYY
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const userId = session.user.id;

  const todayKey = berlinTodayKey();
  const parsed = yearSchema.safeParse(
    request.nextUrl.searchParams.get("year") ?? todayKey.slice(0, 4),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültiges Jahr" },
      { status: 400 },
    );
  }
  const year = parsed.data;
  const isCurrentYear = year === Number(todayKey.slice(0, 4));

  try {
    const context = await loadReportContext(userId);
    const yearLast = `${year}-12-31`;
    const to = todayKey < yearLast ? todayKey : yearLast;

    const [entries, holidays, currentBalance] = await Promise.all([
      // Ab Erfassungsbeginn, damit der Eröffnungssaldo stimmt
      context.trackingStart
        ? loadReportEntries(userId, context.trackingStart, to)
        : Promise.resolve([]),
      loadHolidays(userId, [year], context.schedule.workDays),
      isCurrentYear ? loadCurrentBalance(userId) : Promise.resolve(null),
    ]);

    // Wie der Saldo: nur importierte Feiertage mindern das Soll
    const report = buildYearReport({
      year,
      todayKey,
      entries,
      schedule: context.schedule,
      holidayKeys: holidays.importedKeys,
      trackingStart: context.trackingStart,
      initialBalance: context.initialBalance,
    });

    const notImported = [...holidays.allKeys]
      .filter(
        (key) =>
          key.startsWith(`${year}-`) &&
          !holidays.importedKeys.has(key) &&
          context.trackingStart !== null &&
          key >= context.trackingStart &&
          key <= to &&
          context.schedule.workDays.includes(weekdayOfKey(key)),
      )
      .sort()
      .map((date) => ({ date, name: holidays.names[date] ?? "Feiertag" }));

    const body: YearReportResponse = {
      report,
      adjustment: context.adjustmentDate
        ? { date: context.adjustmentDate, hours: context.initialBalance }
        : null,
      currentBalance,
      holidays: {
        notImported,
        unavailable: holidays.unavailableYears.length > 0,
      },
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Jahresübersicht konnte nicht erstellt werden:", error);
    return NextResponse.json(
      { error: "Jahresübersicht konnte nicht erstellt werden" },
      { status: 500 },
    );
  }
}
