import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { EncryptionKeyError, encryptSecret } from "@/lib/crypto";
import { berlinDayStart, berlinTodayKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  timingSettingsUpdateSchema,
  toPublicSettings,
} from "@/lib/timing/settings";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Nicht angemeldet" },
      { status: 401 },
    );
  }

  const integration = await prisma.timingIntegration.findUnique({
    where: { userId: session.user.id },
  });
  return NextResponse.json({
    success: true,
    data: toPublicSettings(integration),
  });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Nicht angemeldet" },
      { status: 401 },
    );
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültige Anfrage" },
      { status: 400 },
    );
  }

  const parsed = timingSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Token: undefined = unverändert, null/"" = löschen, sonst verschlüsseln
  let apiTokenEnc: string | null | undefined;
  if (input.apiToken === null || input.apiToken === "") {
    apiTokenEnc = null;
  } else if (input.apiToken !== undefined) {
    try {
      apiTokenEnc = encryptSecret(input.apiToken);
    } catch (error) {
      if (error instanceof EncryptionKeyError) {
        return NextResponse.json(
          {
            success: false,
            error: `Token kann nicht gespeichert werden: ${error.message}`,
          },
          { status: 400 },
        );
      }
      throw error;
    }
  }

  const existing = await prisma.timingIntegration.findUnique({
    where: { userId },
  });
  const tokenAfterUpdate =
    apiTokenEnc === undefined ? existing?.apiTokenEnc : apiTokenEnc;
  if (input.syncEnabled === true && !tokenAfterUpdate) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Hinterlege zuerst einen API-Token, bevor du Auto-Sync aktivierst.",
      },
      { status: 400 },
    );
  }
  // Ohne Token kein Auto-Sync
  const syncEnabled = tokenAfterUpdate ? input.syncEnabled : false;

  // Feiertage nach Timing: braucht Token und Projekt. Beim Einschalten gilt
  // der heutige Tag als erster – frühere Feiertage bleiben nur lokal.
  const holidayProjectAfterUpdate =
    input.holidayProjectId === undefined
      ? (existing?.holidayProjectId ?? null)
      : input.holidayProjectId;
  if (
    input.writeHolidays === true &&
    (!tokenAfterUpdate || !holidayProjectAfterUpdate)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: tokenAfterUpdate
          ? "Wähle zuerst ein Timing-Projekt für die Feiertage."
          : "Hinterlege zuerst einen API-Token, bevor du Feiertage nach Timing einträgst.",
      },
      { status: 400 },
    );
  }
  const turnsSickOn = Boolean(input.sickProjectId) && !existing?.sickProjectId;
  const turnsHolidaysOn =
    input.writeHolidays === true && !existing?.writeHolidays;

  const data = {
    ...(apiTokenEnc !== undefined && { apiTokenEnc }),
    ...(input.projectRoots && { projectRoots: input.projectRoots }),
    ...(syncEnabled !== undefined && { syncEnabled }),
    ...(input.syncIntervalMinutes !== undefined && {
      syncIntervalMinutes: input.syncIntervalMinutes,
    }),
    ...(input.syncWindowDays !== undefined && {
      syncWindowDays: input.syncWindowDays,
    }),
    ...(input.writeHolidays !== undefined && {
      writeHolidays: input.writeHolidays,
    }),
    ...(input.holidayProjectId !== undefined && {
      holidayProjectId: input.holidayProjectId,
    }),
    ...(input.sickProjectId !== undefined && {
      sickProjectId: input.sickProjectId,
    }),
    // Krank nach Timing: ab dem Wählen des Projekts – früher angelegte
    // Krank-Einträge bleiben nur lokal
    ...(turnsSickOn && { sickSince: new Date() }),
    ...(turnsHolidaysOn && {
      holidaysSince: berlinDayStart(berlinTodayKey()),
    }),
  };

  const integration = await prisma.timingIntegration.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  return NextResponse.json({
    success: true,
    data: toPublicSettings(integration),
  });
}
