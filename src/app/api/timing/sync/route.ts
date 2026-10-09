import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { EncryptionKeyError } from "@/lib/crypto";
import { strictRateLimit } from "@/lib/rate-limit";
import { TimingApiError } from "@/lib/timing/client";
import {
  InvalidSyncRangeError,
  SyncInProgressError,
  sanitizeSyncError,
  syncTimingForUser,
  TimingNotConfiguredError,
  validateSyncRange,
} from "@/services/timing-sync.service";

// Ein Backfill über viele Monate kann dauern
export const maxDuration = 300;

const syncSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

function errorResponse(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Nicht angemeldet", 401);
  const userId = session.user.id;

  const limited = await strictRateLimit(request, `timing:${userId}`);
  if (limited) return limited;

  const raw = await request.text();
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return errorResponse("Ungültige Anfrage", 400);
  }
  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) return errorResponse("Ungültige Eingabe", 400);

  const { from, to } = parsed.data;
  if (Boolean(from) !== Boolean(to)) {
    return errorResponse("Gib für einen Zeitraum Start und Ende an.", 400);
  }

  try {
    const range = from && to ? validateSyncRange({ from, to }) : undefined;
    const stats = await syncTimingForUser(userId, {
      trigger: "manual",
      range,
    });
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    if (error instanceof InvalidSyncRangeError) {
      return errorResponse(error.message, 400);
    }
    if (error instanceof SyncInProgressError) {
      return errorResponse(error.message, 409);
    }
    if (
      error instanceof TimingNotConfiguredError ||
      error instanceof EncryptionKeyError
    ) {
      return errorResponse(error.message, 400);
    }
    if (error instanceof TimingApiError) {
      const status =
        error.code === "UNAUTHORIZED"
          ? 400
          : error.code === "RATE_LIMITED"
            ? 429
            : 502;
      return errorResponse(error.message, status);
    }
    console.error(
      `[timing-sync] Sync fehlgeschlagen: ${sanitizeSyncError(error)}`,
    );
    return errorResponse("Synchronisierung fehlgeschlagen.", 500);
  }
}
