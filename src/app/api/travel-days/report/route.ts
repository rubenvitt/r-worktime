import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { berlinTodayKey } from "@/lib/dates";
import { travelYearSchema } from "@/lib/reports/travel";
import { loadTravelReport } from "@/lib/reports/travel-store";

// GET /api/travel-days/report?year=YYYY – effektive Reisetage eines Jahres
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const raw =
    request.nextUrl.searchParams.get("year") || berlinTodayKey().slice(0, 4);
  const year = travelYearSchema.safeParse(raw);
  if (!year.success) {
    return NextResponse.json(
      { error: year.error.issues[0]?.message ?? "Ungültiges Jahr" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await loadTravelReport(session.user.id, year.data),
    );
  } catch (error) {
    console.error("Reisetage-Bericht konnte nicht erstellt werden:", error);
    return NextResponse.json(
      { error: "Reisetage-Bericht konnte nicht erstellt werden" },
      { status: 500 },
    );
  }
}
