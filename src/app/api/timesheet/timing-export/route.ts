import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { toTimingExportEntry } from "@/lib/timesheet/entries";
import {
  loadTimesheetEntries,
  parseTimesheetQuery,
} from "@/lib/timesheet/query";

// GET /api/timesheet/timing-export?month=YYYY-MM&root=<prefix>&includeAbsences=0
// Rohdaten des Stundenzettels im Timing-JSON-Exportformat als Download.
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
    const entries = await loadTimesheetEntries(session.user.id, query.data);
    const body = JSON.stringify(entries.map(toTimingExportEntry), null, 2);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="timing-export-${query.data.month}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Timing-Export fehlgeschlagen:", error);
    return NextResponse.json(
      { error: "Export fehlgeschlagen" },
      { status: 500 },
    );
  }
}
