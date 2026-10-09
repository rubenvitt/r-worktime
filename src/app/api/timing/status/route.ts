import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toPublicStatus } from "@/lib/timing/settings";
import { isSyncRunning } from "@/services/timing-sync.service";

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
    data: toPublicStatus(integration, isSyncRunning(session.user.id)),
  });
}
