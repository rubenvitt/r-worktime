import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { overtimeService } from "@/services/overtime.service";
import type {
  OvertimeBalance,
  StatisticsApiResponse,
} from "@/types/statistics";

const querySchema = z.object({
  startDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  endDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  includeDetails: z
    .string()
    .optional()
    .transform((val) => val === "true"),
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
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      includeDetails: searchParams.get("includeDetails") || "true",
    };

    const validatedQuery = querySchema.parse(queryData);

    // Berechne Overtime Balance
    const balance = await overtimeService.calculateBalance({
      userId: session.user.id,
      startDate: validatedQuery.startDate,
      endDate: validatedQuery.endDate,
      includeDetails: validatedQuery.includeDetails ?? true,
    });

    // Response mit Metadata
    const response: StatisticsApiResponse<OvertimeBalance> = {
      data: balance,
      metadata: {
        cached: false, // Könnte aus Service kommen
        calculatedAt: new Date(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error calculating overtime:", error);

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

    // Recalculate Historical Data endpoint
    if (body.action === "recalculate") {
      const { startDate, endDate } = body;

      if (!startDate || !endDate) {
        return NextResponse.json(
          { error: "startDate and endDate are required for recalculation" },
          { status: 400 },
        );
      }

      await overtimeService.recalculateHistoricalData(
        session.user.id,
        new Date(startDate),
        new Date(endDate),
      );

      return NextResponse.json({
        message: "Historical data recalculation triggered",
        userId: session.user.id,
        period: { startDate, endDate },
      });
    }

    // Cache Invalidation endpoint
    if (body.action === "invalidateCache") {
      overtimeService.invalidateCache(session.user.id);

      return NextResponse.json({
        message: "Cache invalidated successfully",
        userId: session.user.id,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error in overtime POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
