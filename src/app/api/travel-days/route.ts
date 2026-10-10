import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isDateKey } from "@/lib/dates";
import {
  parseTravelRangeQuery,
  travelDecisionSchema,
} from "@/lib/reports/travel";
import {
  deleteTravelDay,
  listTravelDays,
  upsertTravelDay,
} from "@/lib/reports/travel-store";

// GET /api/travel-days?month=YYYY-MM | ?year=YYYY | ?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const range = parseTravelRangeQuery(request.nextUrl.searchParams);
  if (!range.success) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }

  try {
    const travelDays = await listTravelDays(session.user.id, range.data);
    return NextResponse.json({ ...range.data, travelDays });
  } catch (error) {
    console.error("Reisetage konnten nicht geladen werden:", error);
    return NextResponse.json(
      { error: "Reisetage konnten nicht geladen werden" },
      { status: 500 },
    );
  }
}

// PUT /api/travel-days { date: "YYYY-MM-DD", isTravel: boolean } – legt fest (Upsert)
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = travelDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Daten" },
      { status: 400 },
    );
  }

  try {
    const travelDay = await upsertTravelDay(session.user.id, parsed.data);
    return NextResponse.json({ travelDay });
  } catch (error) {
    console.error("Reisetag konnte nicht gespeichert werden:", error);
    return NextResponse.json(
      { error: "Reisetag konnte nicht gespeichert werden" },
      { status: 500 },
    );
  }
}

// DELETE /api/travel-days?date=YYYY-MM-DD – Festlegung entfernen, es gilt wieder der Vorschlag
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!isDateKey(date)) {
    return NextResponse.json(
      { error: "Datum im Format JJJJ-MM-TT erwartet" },
      { status: 400 },
    );
  }

  try {
    const deleted = await deleteTravelDay(session.user.id, date);
    return NextResponse.json({ date, deleted });
  } catch (error) {
    console.error("Reisetag konnte nicht zurückgesetzt werden:", error);
    return NextResponse.json(
      { error: "Reisetag konnte nicht zurückgesetzt werden" },
      { status: 500 },
    );
  }
}
