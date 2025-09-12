import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ProblemDetectionService } from "@/services/problem-detection.service";

const reviewSchema = z.object({
  date: z.string(),
  reason: z.string().optional(),
});

const bulkReviewSchema = z.object({
  dates: z.array(z.string()),
  reason: z.string().optional(),
});

// Mark single day as reviewed
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = reviewSchema.parse(body);

    const problemService = new ProblemDetectionService();
    await problemService.markAsReviewed(
      session.user.id,
      new Date(validated.date),
      validated.reason,
    );

    return NextResponse.json({
      success: true,
      message: "Day marked as reviewed",
    });
  } catch (error) {
    console.error("Error marking day as reviewed:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Mark multiple days as reviewed
export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = bulkReviewSchema.parse(body);

    const problemService = new ProblemDetectionService();
    const dates = validated.dates.map((d) => new Date(d));

    await problemService.markMultipleAsReviewed(
      session.user.id,
      dates,
      validated.reason,
    );

    return NextResponse.json({
      success: true,
      message: `${dates.length} days marked as reviewed`,
    });
  } catch (error) {
    console.error("Error marking days as reviewed:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Get reviewed days
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const problemService = new ProblemDetectionService();
    const reviewedDays = await problemService.getReviewedDays(
      session.user.id,
      startDate && endDate
        ? {
            startDate: new Date(startDate),
            endDate: new Date(endDate),
          }
        : undefined,
    );

    return NextResponse.json({ reviewedDays });
  } catch (error) {
    console.error("Error fetching reviewed days:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Unreview a day
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const date = searchParams.get("date");

    if (!date) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    const problemService = new ProblemDetectionService();
    await problemService.unreviewDay(session.user.id, new Date(date));

    return NextResponse.json({ success: true, message: "Review removed" });
  } catch (error) {
    console.error("Error removing review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
