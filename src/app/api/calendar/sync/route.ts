import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { strictRateLimit } from "@/lib/rate-limit";
import {
  CalendarNotConfiguredError,
  CalendarSyncInProgressError,
  syncCalendarForUser,
} from "@/services/calendar-sync.service";

// Viele Timing-Aufrufe beim ersten Lauf können dauern
export const maxDuration = 300;

// POST /api/calendar/sync – „Jetzt abgleichen“. Ein gescheiterter Lauf
// (Feed nicht erreichbar o. Ä.) antwortet mit 200 und status "error", weil
// er protokolliert ist; 409, wenn schon ein Lauf läuft.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const userId = session.user.id;

  const limited = await strictRateLimit(request, `calendar:${userId}`);
  if (limited) return limited;

  try {
    const result = await syncCalendarForUser(userId, { trigger: "manual" });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CalendarSyncInProgressError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof CalendarNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(
      "[calendar-sync] Abgleich fehlgeschlagen:",
      error instanceof Error ? error.name : "unbekannt",
    );
    return NextResponse.json(
      { error: "Der Kalender-Abgleich ist fehlgeschlagen." },
      { status: 500 },
    );
  }
}
