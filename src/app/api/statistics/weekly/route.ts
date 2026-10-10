import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { berlinDateKey, isoWeekOf, isValidIsoWeek } from "@/lib/dates";
import { overtimeService } from "@/services/overtime.service";
import type {
  StatisticsApiResponse,
  WeeklyStatistics,
} from "@/types/statistics";

const querySchema = z.object({
  year: z
    .string()
    .transform((val) => parseInt(val, 10))
    .optional(),
  week: z
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
      week: searchParams.get("week") || undefined,
      date: searchParams.get("date") || undefined,
    };

    const validatedQuery = querySchema.parse(queryData);

    // Bestimme ISO-Wochenjahr und ISO-Woche (Berliner Kalendertag)
    let year: number;
    let week: number;

    if (validatedQuery.date) {
      if (Number.isNaN(validatedQuery.date.getTime())) {
        return NextResponse.json({ error: "Invalid date." }, { status: 400 });
      }
      ({ year, week } = isoWeekOf(berlinDateKey(validatedQuery.date)));
    } else if (validatedQuery.year && validatedQuery.week) {
      year = validatedQuery.year;
      week = validatedQuery.week;
    } else {
      // Default: Aktuelle Woche
      ({ year, week } = isoWeekOf(berlinDateKey(new Date())));
    }

    // Validiere Wochennummer (KW 53 gibt es nur in manchen Jahren)
    if (!isValidIsoWeek(year, week)) {
      return NextResponse.json(
        { error: "Invalid ISO week for this year." },
        { status: 400 },
      );
    }

    // Berechne wöchentliche Statistiken
    const weeklyStats = await overtimeService.calculateWeeklyStatistics(
      session.user.id,
      year,
      week,
    );

    // Response mit Metadata
    const response: StatisticsApiResponse<WeeklyStatistics> = {
      data: weeklyStats,
      metadata: {
        cached: false,
        calculatedAt: new Date(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error calculating weekly statistics:", error);

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

    // Bulk fetch for multiple weeks
    if (body.action === "bulkFetch") {
      const { year, weeks } = body;

      if (!year || !Array.isArray(weeks)) {
        return NextResponse.json(
          { error: "year and weeks array are required for bulk fetch" },
          { status: 400 },
        );
      }

      if (!weeks.every((week) => isValidIsoWeek(year, week))) {
        return NextResponse.json(
          { error: "Invalid ISO week for this year." },
          { status: 400 },
        );
      }

      const results = await Promise.all(
        weeks.map((week) =>
          overtimeService.calculateWeeklyStatistics(
            session.user.id,
            year,
            week,
          ),
        ),
      );

      return NextResponse.json({
        data: results,
        metadata: {
          year,
          weeks,
          calculatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error in weekly statistics POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
