import { getMonth, getYear } from "date-fns";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { overtimeService } from "@/services/overtime.service";
import type {
  MonthlyStatistics,
  StatisticsApiResponse,
} from "@/types/statistics";

const querySchema = z.object({
  year: z
    .string()
    .transform((val) => parseInt(val, 10))
    .optional(),
  month: z
    .string()
    .transform((val) => parseInt(val, 10))
    .optional(),
  date: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
});

export async function GET(request: NextRequest) {
  try {
    // Auth Check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse Query Parameters
    const searchParams = request.nextUrl.searchParams;
    const queryData = {
      year: searchParams.get("year") || undefined,
      month: searchParams.get("month") || undefined,
      date: searchParams.get("date") || undefined,
    };

    const validatedQuery = querySchema.parse(queryData);

    // Bestimme Jahr und Monat
    let year: number;
    let month: number;

    if (validatedQuery.date) {
      // Wenn ein Datum angegeben wurde, extrahiere Jahr und Monat
      year = getYear(validatedQuery.date);
      month = getMonth(validatedQuery.date) + 1; // getMonth gibt 0-11 zurück
    } else if (validatedQuery.year && validatedQuery.month) {
      // Wenn Jahr und Monat direkt angegeben wurden
      year = validatedQuery.year;
      month = validatedQuery.month;
    } else {
      // Default: Aktueller Monat
      const now = new Date();
      year = getYear(now);
      month = getMonth(now) + 1;
    }

    // Validiere Monat
    if (month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Invalid month number. Must be between 1 and 12." },
        { status: 400 },
      );
    }

    // Berechne monatliche Statistiken
    const monthlyStats = await overtimeService.calculateMonthlyStatistics(
      session.user.id,
      year,
      month,
    );

    // Response mit Metadata
    const response: StatisticsApiResponse<MonthlyStatistics> = {
      data: monthlyStats,
      metadata: {
        cached: false,
        calculatedAt: new Date(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error calculating monthly statistics:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request parameters", details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth Check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Yearly overview - alle Monate eines Jahres
    if (body.action === "yearlyOverview") {
      const { year } = body;

      if (!year) {
        return NextResponse.json(
          { error: "year is required for yearly overview" },
          { status: 400 },
        );
      }

      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) => i + 1).map((month) =>
          overtimeService.calculateMonthlyStatistics(
            session.user.id,
            year,
            month,
          ),
        ),
      );

      // Berechne Jahresstatistiken
      const yearlyTotals = results.reduce(
        (acc, month) => ({
          totalHours: acc.totalHours + month.totalHours,
          targetHours: acc.targetHours + month.targetHours,
          overtimeHours: acc.overtimeHours + month.overtimeHours,
          billableHours: acc.billableHours + month.billableHours,
          nonBillableHours: acc.nonBillableHours + month.nonBillableHours,
        }),
        {
          totalHours: 0,
          targetHours: 0,
          overtimeHours: 0,
          billableHours: 0,
          nonBillableHours: 0,
        },
      );

      return NextResponse.json({
        data: {
          year,
          months: results,
          yearlyTotals,
        },
        metadata: {
          calculatedAt: new Date(),
        },
      });
    }

    // Quarter statistics - 3 Monate auf einmal
    if (body.action === "quarterStats") {
      const { year, quarter } = body;

      if (!year || !quarter || quarter < 1 || quarter > 4) {
        return NextResponse.json(
          { error: "Valid year and quarter (1-4) are required" },
          { status: 400 },
        );
      }

      const startMonth = (quarter - 1) * 3 + 1;
      const months = [startMonth, startMonth + 1, startMonth + 2];

      const results = await Promise.all(
        months.map((month) =>
          overtimeService.calculateMonthlyStatistics(
            session.user.id,
            year,
            month,
          ),
        ),
      );

      return NextResponse.json({
        data: {
          year,
          quarter,
          months: results,
        },
        metadata: {
          calculatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error in monthly statistics POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
