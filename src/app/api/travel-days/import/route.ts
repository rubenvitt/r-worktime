import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { travelImportSchema } from "@/lib/reports/travel";
import { importTravelDays } from "@/lib/reports/travel-store";

// POST /api/travel-days/import { decisions: [{ date, isTravel }] }
// Einmalige Übernahme alter localStorage-Korrekturen: legt nur Tage an, für
// die noch keine Festlegung existiert (idempotent, überschreibt nichts).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = travelImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Daten" },
      { status: 400 },
    );
  }

  try {
    const imported = await importTravelDays(
      session.user.id,
      parsed.data.decisions,
    );
    return NextResponse.json({ imported });
  } catch (error) {
    console.error("Reisetage konnten nicht übernommen werden:", error);
    return NextResponse.json(
      { error: "Reisetage konnten nicht übernommen werden" },
      { status: 500 },
    );
  }
}
