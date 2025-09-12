import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ProblemDetectionService } from "@/services/problem-detection.service";

const filterSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  problemType: z
    .enum(["missing", "zero_hours", "incomplete", "all"])
    .optional(),
  reviewStatus: z.enum(["reviewed", "unreviewed", "all"]).optional(),
  sortBy: z.enum(["date_asc", "date_desc", "type"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const filters = {
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      problemType: searchParams.get("problemType") || "all",
      reviewStatus: searchParams.get("reviewStatus") || "unreviewed",
      sortBy: searchParams.get("sortBy") || "date_desc",
    };

    const validatedFilters = filterSchema.parse(filters);

    const problemService = new ProblemDetectionService();
    const result = await problemService.findProblematicDays(session.user.id, {
      dateRange:
        validatedFilters.startDate && validatedFilters.endDate
          ? {
              startDate: new Date(validatedFilters.startDate),
              endDate: new Date(validatedFilters.endDate),
            }
          : undefined,
      problemType: validatedFilters.problemType,
      reviewStatus: validatedFilters.reviewStatus,
      sortBy: validatedFilters.sortBy,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching problematic days:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid filters", details: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
