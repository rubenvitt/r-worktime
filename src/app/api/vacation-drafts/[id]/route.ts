import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { berlinDayStart, berlinTodayKey, dateKeyFromDbDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { draftUpdateSchema } from "@/lib/schemas/vacation-draft";
import {
  type VacationDraftDto,
  validateDraftSpan,
} from "@/lib/vacation-planner";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/vacation-drafts/[id] – Zeitraum oder Notiz ändern
export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  const parsed = draftUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
      { status: 400 },
    );
  }

  const existing = await prisma.vacationDraft.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Entwurf nicht gefunden" },
      { status: 404 },
    );
  }

  const from = parsed.data.from ?? dateKeyFromDbDate(existing.startDate);
  const to = parsed.data.to ?? dateKeyFromDbDate(existing.endDate);
  const problem = validateDraftSpan({ from, to }, berlinTodayKey());
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const draft = await prisma.vacationDraft.update({
    where: { id: existing.id },
    data: {
      startDate: berlinDayStart(from),
      endDate: berlinDayStart(to),
      ...(parsed.data.note !== undefined && { note: parsed.data.note }),
    },
  });
  const body: VacationDraftDto = {
    id: draft.id,
    from: dateKeyFromDbDate(draft.startDate),
    to: dateKeyFromDbDate(draft.endDate),
    note: draft.note,
  };
  return NextResponse.json(body);
}

// DELETE /api/vacation-drafts/[id]
export async function DELETE(_request: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const { id } = await params;
  const { count } = await prisma.vacationDraft.deleteMany({
    where: { id, userId: session.user.id },
  });
  if (count === 0) {
    return NextResponse.json(
      { error: "Entwurf nicht gefunden" },
      { status: 404 },
    );
  }
  return new NextResponse(null, { status: 204 });
}
