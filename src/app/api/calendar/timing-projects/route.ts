import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { CalendarTimingProject } from "@/lib/calendar/types";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { createTimingClient, TimingApiError } from "@/lib/timing/client";

// GET /api/calendar/timing-projects – Timing-Projekte für die Auswahl des
// Urlaubsprojekts; 409 ohne Timing-Token
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const timing = await prisma.timingIntegration.findUnique({
    where: { userId: session.user.id },
    select: { apiTokenEnc: true },
  });
  if (!timing?.apiTokenEnc) {
    return NextResponse.json(
      { error: "Kein Timing-Token hinterlegt." },
      { status: 409 },
    );
  }

  let token: string;
  try {
    token = decryptSecret(timing.apiTokenEnc);
  } catch {
    return NextResponse.json(
      { error: "Timing-Token nicht lesbar, bitte neu hinterlegen." },
      { status: 409 },
    );
  }

  try {
    const projects = await createTimingClient({ token }).listProjects();
    const body: CalendarTimingProject[] = projects.map((project) => ({
      id: project.self,
      path: project.path,
    }));
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof TimingApiError) {
      const status =
        error.code === "UNAUTHORIZED"
          ? 400
          : error.code === "RATE_LIMITED"
            ? 429
            : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error(
      "[calendar] Timing-Projekte nicht geladen:",
      error instanceof Error ? error.name : "unbekannt",
    );
    return NextResponse.json(
      { error: "Timing-Projekte konnten nicht geladen werden." },
      { status: 500 },
    );
  }
}
