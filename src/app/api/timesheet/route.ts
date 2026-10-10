import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { monthRange } from "@/lib/dates";
import { loadTravelOverrides } from "@/lib/reports/travel-store";
import {
  buildTimesheetResponse,
  loadAvailableRoots,
  loadTimesheetEntries,
  parseTimesheetQuery,
} from "@/lib/timesheet/query";

// GET /api/timesheet?month=YYYY-MM&root=<prefix>&rounding=15&includeAbsences=0
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const query = parseTimesheetQuery(request.nextUrl.searchParams);
  if (!query.success) {
    return NextResponse.json({ error: query.error }, { status: 400 });
  }

  try {
    const [entries, availableRoots, travelOverrides] = await Promise.all([
      loadTimesheetEntries(session.user.id, query.data),
      loadAvailableRoots(session.user.id),
      loadTravelOverrides(session.user.id, monthRange(query.data.month)),
    ]);
    return NextResponse.json(
      buildTimesheetResponse(
        entries,
        query.data,
        availableRoots,
        travelOverrides,
      ),
    );
  } catch (error) {
    console.error("Stundenzettel konnte nicht erstellt werden:", error);
    return NextResponse.json(
      { error: "Stundenzettel konnte nicht erstellt werden" },
      { status: 500 },
    );
  }
}
