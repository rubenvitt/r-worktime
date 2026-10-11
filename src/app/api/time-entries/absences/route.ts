import { EntrySource, EntryType } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ABSENCE_TITLE,
  type AbsencePlan,
  type AbsenceRangeResponse,
  absenceDescription,
  manualAbsenceFor,
  OCCUPYING_ENTRY_TYPES,
  planAbsenceRange,
  validateAbsenceRange,
} from "@/lib/absence-range";
import { withUserAbsenceLock } from "@/lib/absences/lock";
import { auth } from "@/lib/auth";
import { berlinDayStart, dateKeyFromDbDate, yearsOfRange } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { dailyTargetHours } from "@/lib/reports/absences";
import { loadOfficialHolidays } from "@/lib/reports/forecast-data";
import { overtimeService } from "@/services/overtime.service";
import { getUserSettings } from "@/services/settings.service";

const absenceRangeSchema = z
  .object({
    from: z.string({ error: "Beginn fehlt" }),
    to: z.string({ error: "Ende fehlt" }),
    type: z.enum(["VACATION", "SICK"], {
      error: "Art muss Urlaub (VACATION) oder Krankheit (SICK) sein",
    }),
    halfDay: z.boolean().optional().default(false),
    note: z
      .string()
      .max(500, "Die Notiz darf höchstens 500 Zeichen lang sein")
      .optional(),
    dryRun: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    const message = validateAbsenceRange(value);
    if (message) ctx.addIssue({ code: "custom", message });
  });

// POST /api/time-entries/absences – Urlaub/Krankheit für einen Zeitraum, mit dryRun als Vorschau.
// Urlaub legt zusätzlich eine Absence (source MANUAL, kind VACATION) an und
// verknüpft die Tage; Krankheit bleibt ohne Absence (siehe manualAbsenceFor).
// Der Dialog schreibt nicht nach Timing.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const userId = session.user.id;

  const body: unknown = await request.json().catch(() => null);
  const parsed = absenceRangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Anfrage" },
      { status: 400 },
    );
  }
  const { from, to, type, halfDay, note, dryRun } = parsed.data;

  try {
    const [settings, official] = await Promise.all([
      getUserSettings(userId),
      loadOfficialHolidays(yearsOfRange(from, to)),
    ]);
    const dailyHours = dailyTargetHours(
      settings.weeklyWorkHours,
      settings.workDays,
    );

    // Vorhandene Abwesenheiten/Feiertage lesen und den Plan rechnen – beim
    // Speichern innerhalb der Transaktion, damit ein zweiter, gleichzeitiger
    // Request die eben angelegten Tage sieht
    const planWith = async (db: Pick<typeof prisma, "timeEntry">) => {
      const existing = await db.timeEntry.findMany({
        where: {
          userId,
          type: { in: [...OCCUPYING_ENTRY_TYPES, EntryType.HOLIDAY] },
          source: { not: EntrySource.ADJUSTMENT },
          date: { gte: berlinDayStart(from), lte: berlinDayStart(to) },
        },
        select: { date: true, type: true, description: true },
      });
      return planAbsenceRange({
        from,
        to,
        halfDay,
        workDays: settings.workDays,
        dailyHours,
        officialHolidays: official.names,
        existingEntries: existing.map((entry) => ({
          date: dateKeyFromDbDate(entry.date),
          type: entry.type,
          description: entry.description,
        })),
      });
    };

    let plan: AbsencePlan;
    let absenceId: string | null = null;
    if (dryRun) {
      plan = await planWith(prisma);
    } else {
      const trimmedNote = note?.trim() || null;
      plan = await prisma.$transaction(async (tx) => {
        // Je Nutzer serialisieren (Doppelklick, zwei Tabs): ohne Sperre legen
        // zwei Requests dieselben Tage doppelt an. Dieselbe Sperre nutzen
        // DELETE /api/absences/[id] und der Timewarp-Abgleich.
        await withUserAbsenceLock(tx, userId);
        const txPlan = await planWith(tx);
        const absenceData = manualAbsenceFor(
          type,
          { from, to, halfDay },
          txPlan.days.length,
        );
        const absence = absenceData
          ? await tx.absence.create({
              data: {
                userId,
                source: absenceData.source,
                kind: absenceData.kind,
                startDate: berlinDayStart(absenceData.startDate),
                endDate: berlinDayStart(absenceData.endDate),
                halfDay: absenceData.halfDay,
                status: absenceData.status,
              },
              select: { id: true },
            })
          : null;
        if (txPlan.days.length > 0) {
          await tx.timeEntry.createMany({
            data: txPlan.days.map((day) => ({
              userId,
              date: berlinDayStart(day.date),
              startTime: day.startTime,
              endTime: day.endTime,
              duration: day.hours,
              type,
              title: ABSENCE_TITLE[type],
              notes: trimmedNote,
              description: absenceDescription(type, trimmedNote),
              source: EntrySource.MANUAL,
              absenceId: absence?.id ?? null,
            })),
          });
        }
        absenceId = absence?.id ?? null;
        return txPlan;
      });
      if (plan.days.length > 0) overtimeService.invalidateCache(userId);
    }

    const response: AbsenceRangeResponse = {
      dryRun,
      created: plan.days.length,
      absenceId,
      days: plan.days.map(({ date, hours }) => ({ date, hours })),
      skipped: plan.skipped,
      nonWorkDays: plan.nonWorkDays,
      totalHours: plan.totalHours,
      dailyHours: Math.round(dailyHours * 100) / 100,
      holidayServiceUnavailableYears: official.unavailableYears,
    };
    return NextResponse.json(response, { status: dryRun ? 200 : 201 });
  } catch (error) {
    console.error("Fehler beim Eintragen der Abwesenheit:", error);
    return NextResponse.json(
      { error: "Die Abwesenheit konnte nicht eingetragen werden." },
      { status: 500 },
    );
  }
}
