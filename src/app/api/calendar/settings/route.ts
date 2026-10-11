import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  CalendarFeedError,
  fetchCalendarFeed,
  validateFeedUrl,
} from "@/lib/calendar/feed";
import {
  calendarSettingsUpdateSchema,
  toPublicCalendarSettings,
} from "@/lib/calendar/settings";
import {
  parseTimewarpFeed,
  summarizeFeed,
  TimewarpParseError,
} from "@/lib/calendar/timewarp";
import type { CalendarFeedTest } from "@/lib/calendar/types";
import { EncryptionKeyError, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { strictRateLimit } from "@/lib/rate-limit";

// Einstellungen der Kalender-Integration (Timewarp-Feed). Die Feed-URL wird
// verschlüsselt gespeichert und nie zurückgegeben, nur ihr Host.

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function timingConnected(userId: string): Promise<boolean> {
  const timing = await prisma.timingIntegration.findUnique({
    where: { userId },
    select: { apiTokenEnc: true },
  });
  return Boolean(timing?.apiTokenEnc);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Nicht angemeldet", 401);
  const userId = session.user.id;

  const [integration, connected] = await Promise.all([
    prisma.calendarIntegration.findUnique({ where: { userId } }),
    timingConnected(userId),
  ]);
  return NextResponse.json(toPublicCalendarSettings(integration, connected));
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("Nicht angemeldet", 401);
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Ungültige Anfrage", 400);
  }
  const parsed = calendarSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
      400,
    );
  }
  const input = parsed.data;

  // Feed-URL: undefined = unverändert, null/"" = löschen, sonst prüfen,
  // per Testabruf auswerten und verschlüsseln
  let feedUrlEnc: string | null | undefined;
  let test: CalendarFeedTest | undefined;
  if (input.feedUrl === null || input.feedUrl === "") {
    feedUrlEnc = null;
  } else if (input.feedUrl !== undefined) {
    const limited = await strictRateLimit(request, `calendar:${userId}`);
    if (limited) return limited;
    try {
      validateFeedUrl(input.feedUrl);
      const feed = parseTimewarpFeed(await fetchCalendarFeed(input.feedUrl));
      test = summarizeFeed(feed);
      feedUrlEnc = encryptSecret(input.feedUrl);
    } catch (error) {
      if (
        error instanceof CalendarFeedError ||
        error instanceof TimewarpParseError
      ) {
        return errorResponse(error.message, 400);
      }
      if (error instanceof EncryptionKeyError) {
        return errorResponse(
          `Feed-URL kann nicht gespeichert werden: ${error.message}`,
          400,
        );
      }
      console.error(
        "[calendar] Testabruf fehlgeschlagen:",
        error instanceof Error ? error.name : "unbekannt",
      );
      return errorResponse(
        "Der Kalender-Feed konnte nicht geprüft werden.",
        400,
      );
    }
  }

  const existing = await prisma.calendarIntegration.findUnique({
    where: { userId },
    select: { feedUrlEnc: true },
  });
  const feedAfterUpdate =
    feedUrlEnc === undefined ? existing?.feedUrlEnc : feedUrlEnc;
  if (input.syncEnabled === true && !feedAfterUpdate) {
    return errorResponse(
      "Hinterlege zuerst eine Feed-URL, bevor du den automatischen Abgleich aktivierst.",
      400,
    );
  }
  // Ohne Feed kein automatischer Abgleich (beim Löschen der URL abschalten)
  const syncEnabled = feedAfterUpdate
    ? input.syncEnabled
    : feedUrlEnc === null
      ? false
      : input.syncEnabled;

  const data = {
    ...(feedUrlEnc !== undefined && { feedUrlEnc }),
    ...(syncEnabled !== undefined && { syncEnabled }),
    ...(input.writeToTiming !== undefined && {
      writeToTiming: input.writeToTiming,
    }),
    ...(input.timingProjectId !== undefined && {
      timingProjectId: input.timingProjectId || null,
    }),
  };

  const [integration, connected] = await Promise.all([
    prisma.calendarIntegration.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    }),
    timingConnected(userId),
  ]);

  return NextResponse.json({
    settings: toPublicCalendarSettings(integration, connected),
    ...(test && { test }),
  });
}
