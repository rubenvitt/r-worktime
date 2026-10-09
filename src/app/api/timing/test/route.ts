import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { strictRateLimit } from "@/lib/rate-limit";
import { createTimingClient, TimingApiError } from "@/lib/timing/client";
import { sanitizeSyncError } from "@/services/timing-sync.service";

const testSchema = z.object({
  // Optional: noch nicht gespeicherten Token prüfen
  apiToken: z.string().trim().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Nicht angemeldet" },
      { status: 401 },
    );
  }
  const userId = session.user.id;

  const limited = await strictRateLimit(request, `timing:${userId}`);
  if (limited) return limited;

  const raw = await request.text();
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return NextResponse.json(
      { success: false, error: "Ungültige Anfrage" },
      { status: 400 },
    );
  }
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Ungültige Eingabe" },
      { status: 400 },
    );
  }

  let token = parsed.data.apiToken;
  try {
    if (!token) {
      const integration = await prisma.timingIntegration.findUnique({
        where: { userId },
      });
      if (!integration?.apiTokenEnc) {
        return NextResponse.json(
          { success: false, error: "Kein Timing-API-Token hinterlegt." },
          { status: 400 },
        );
      }
      token = decryptSecret(integration.apiTokenEnc);
    }

    const result = await createTimingClient({ token }).testConnection();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const status =
      error instanceof TimingApiError
        ? error.code === "UNAUTHORIZED"
          ? 400
          : error.code === "RATE_LIMITED"
            ? 429
            : 502
        : 500;
    return NextResponse.json(
      { success: false, error: sanitizeSyncError(error, token) },
      { status },
    );
  }
}
