import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { EncryptionKeyError, encryptSecret } from "@/lib/crypto";
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
