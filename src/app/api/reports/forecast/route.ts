import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { berlinTodayKey, monthRange } from "@/lib/dates";
import {
  baselineStartKey,
  buildForecast,
  DEFAULT_BASE_MONTHS,
  DEFAULT_FORECAST_HORIZON,
  type Forecast,
  forecastEndMonth,
  isBaseMonthCount,
  isForecastHorizon,
} from "@/lib/reports/forecast";
import {
  loadCurrentBalance,
  loadHolidays,
  loadReportContext,
  loadReportEntries,
} from "@/lib/reports/forecast-data";

const querySchema = z.object({
  horizon: z.coerce
    .number()
    .refine(isForecastHorizon, "Horizont muss 3, 6 oder 12 Monate sein")
    .default(DEFAULT_FORECAST_HORIZON),
  base: z.coerce
    .number()
    .refine(isBaseMonthCount, "Basis muss 3, 6 oder 12 Monate sein")
    .default(DEFAULT_BASE_MONTHS),
});

export interface ForecastResponse {
  forecast: Forecast;
  schedule: { weeklyHours: number; workDays: number[] };
  trackingStart: string | null;
  holidays: {
    /** Datum → Name für alle Feiertage im Zeitraum */
    names: Record<string, string>;
    /** Feiertags-Dienst nicht erreichbar: nur importierte Feiertage berücksichtigt */
    unavailableYears: number[];
  };
}

// GET /api/reports/forecast?horizon=3|6|12&base=3|6|12
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const userId = session.user.id;

  const params = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    horizon: params.get("horizon") ?? undefined,
    base: params.get("base") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Parameter" },
      { status: 400 },
    );
  }
  const { horizon, base } = parsed.data;

  try {
    const todayKey = berlinTodayKey();
    const from = baselineStartKey(todayKey, base);
    const to = monthRange(forecastEndMonth(todayKey, horizon)).lastKey;
    const years: number[] = [];
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
      years.push(y);
    }

    const context = await loadReportContext(userId);
    const [entries, holidays, currentBalance] = await Promise.all([
      loadReportEntries(userId, from, to),
      loadHolidays(userId, years),
      loadCurrentBalance(userId),
    ]);

    const forecast = buildForecast({
      todayKey,
      horizon,
      baseMonths: base,
      entries,
      schedule: context.schedule,
      holidayKeys: holidays.allKeys,
      trackingStart: context.trackingStart,
      currentBalance,
    });

    const currentYear = Number(todayKey.slice(0, 4));
    const body: ForecastResponse = {
      forecast,
      schedule: {
        weeklyHours: context.weeklyHours,
        workDays: [...context.schedule.workDays],
      },
      trackingStart: context.trackingStart,
      holidays: {
        names: Object.fromEntries(
          Object.entries(holidays.names).filter(
            ([key]) => key >= from && key <= to,
          ),
        ),
        unavailableYears: holidays.unavailableYears.filter(
          (y) => y >= currentYear,
        ),
      },
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Prognose konnte nicht erstellt werden:", error);
    return NextResponse.json(
      { error: "Prognose konnte nicht erstellt werden" },
      { status: 500 },
    );
  }
}
