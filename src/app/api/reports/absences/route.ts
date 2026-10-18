import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { berlinTodayKey } from "@/lib/dates";
import { loadAbsenceReport } from "@/services/absence-report.service";

const yearSchema = z
  .string()
  .regex(/^\d{4}$/, "Jahr im Format JJJJ erwartet")
  .transform(Number)
  .pipe(
    z
      .number()
      .min(2000, "Jahr muss zwischen 2000 und 2100 liegen")
      .max(2100, "Jahr muss zwischen 2000 und 2100 liegen"),
  );

// GET /api/reports/absences?year=YYYY
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const userId = session.user.id;

  const todayKey = berlinTodayKey();
  const rawYear = request.nextUrl.searchParams.get("year");
  const parsed = yearSchema.safeParse(rawYear ?? todayKey.slice(0, 4));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültiges Jahr" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await loadAbsenceReport(userId, parsed.data, todayKey),
    );
  } catch (error) {
    console.error("Abwesenheitsbericht konnte nicht erstellt werden:", error);
    return NextResponse.json(
      { error: "Abwesenheitsbericht konnte nicht erstellt werden" },
      { status: 500 },
    );
  }
}
