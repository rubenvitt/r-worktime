import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  CALENDAR_SYNC_LOG_KEEP,
  type CalendarSyncAction,
  type CalendarSyncLogEntry,
} from "@/lib/calendar/types";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  limit: z.coerce
    .number({ error: "limit muss eine Zahl sein" })
    .int("limit muss eine ganze Zahl sein")
    .min(1, "limit mindestens 1")
    .max(CALENDAR_SYNC_LOG_KEEP, `limit höchstens ${CALENDAR_SYNC_LOG_KEEP}`)
    .default(20),
});

// GET /api/calendar/logs?limit=20 – letzte Abgleiche, neueste zuerst
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Anfrage" },
      { status: 400 },
    );
  }

  const logs = await prisma.absenceSyncLog.findMany({
    where: { userId: session.user.id },
    orderBy: { startedAt: "desc" },
    take: parsed.data.limit,
  });

  const body: CalendarSyncLogEntry[] = logs.map((log) => ({
    id: log.id,
    startedAt: log.startedAt.toISOString(),
    finishedAt: log.finishedAt?.toISOString() ?? null,
    status: log.status,
    error: log.error,
    actions: Array.isArray(log.actions)
      ? (log.actions as unknown as CalendarSyncAction[])
      : [],
  }));
  return NextResponse.json(body);
}
