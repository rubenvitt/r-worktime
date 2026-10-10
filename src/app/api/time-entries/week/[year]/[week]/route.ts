import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { isValidIsoWeek } from "@/lib/dates";
import { weekService } from "@/services/week.service";
import type { WeekDataResponse } from "@/types/statistics";

const paramsSchema = z.object({
  year: z.string().transform((val) => parseInt(val, 10)),
  week: z.string().transform((val) => parseInt(val, 10)),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ year: string; week: string }> },
) {
  try {
    // Auth Check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse und validiere Parameter
    const resolvedParams = await params;
    const validatedParams = paramsSchema.parse(resolvedParams);

    // Validierung der ISO-Woche (KW 53 gibt es nur in manchen Jahren)
    if (!isValidIsoWeek(validatedParams.year, validatedParams.week)) {
      return NextResponse.json(
        { error: "Invalid ISO week for this year" },
        { status: 400 },
      );
    }

    // Validierung des Jahres (nicht in ferner Zukunft oder Vergangenheit)
    const currentYear = new Date().getFullYear();
    if (
      validatedParams.year < currentYear - 10 ||
      validatedParams.year > currentYear + 1
    ) {
      return NextResponse.json(
        { error: "Invalid year. Must be within reasonable range" },
        { status: 400 },
      );
    }

    // Hole Wochendaten
    const weekData = await weekService.getWeekData(
      session.user.id,
      validatedParams.year,
      validatedParams.week,
    );

    // Response mit Wochendaten
    const response: WeekDataResponse = {
      data: weekData,
      metadata: {
        year: validatedParams.year,
        week: validatedParams.week,
        calculatedAt: new Date(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching week data:", error);

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
