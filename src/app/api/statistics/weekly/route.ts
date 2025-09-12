import { getWeek, getYear } from "date-fns";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
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

    // Bestimme Jahr und Woche
    let year: number;
    let week: number;

    if (validatedQuery.date) {
      // Wenn ein Datum angegeben wurde, extrahiere Jahr und Woche
      year = getYear(validatedQuery.date);
      week = getWeek(validatedQuery.date, { weekStartsOn: 1 });
    } else if (validatedQuery.year && validatedQuery.week) {
      // Wenn Jahr und Woche direkt angegeben wurden
      year = validatedQuery.year;
      week = validatedQuery.week;
    } else {
      // Default: Aktuelle Woche
      const now = new Date();
      year = getYear(now);
      week = getWeek(now, { weekStartsOn: 1 });
    }

    // Validiere Wochennummer
    if (week < 1 || week > 53) {
      return NextResponse.json(
        { error: "Invalid week number. Must be between 1 and 53." },
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
