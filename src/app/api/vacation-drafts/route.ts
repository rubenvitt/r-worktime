import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { berlinDayStart, berlinTodayKey, dateKeyFromDbDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { draftCreateSchema } from "@/lib/schemas/vacation-draft";
import {
  type VacationDraftDto,
  validateDraftSpan,
} from "@/lib/vacation-planner";

// POST /api/vacation-drafts – Entwurf im Urlaubsplaner anlegen
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const parsed = draftCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
      { status: 400 },
    );
  }
  const { from, to, note } = parsed.data;
  const problem = validateDraftSpan({ from, to }, berlinTodayKey());
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const draft = await prisma.vacationDraft.create({
    data: {
      userId: session.user.id,
      startDate: berlinDayStart(from),
      endDate: berlinDayStart(to),
      note: note ?? null,
    },
  });
  const body: VacationDraftDto = {
    id: draft.id,
    from: dateKeyFromDbDate(draft.startDate),
    to: dateKeyFromDbDate(draft.endDate),
    note: draft.note,
  };
  return NextResponse.json(body, { status: 201 });
}
