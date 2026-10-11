import { AbsenceSource } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { withUserAbsenceLock } from "@/lib/absences/lock";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { overtimeService } from "@/services/overtime.service";

// DELETE /api/absences/[id] – manuelle Abwesenheit als Ganzes löschen: alle
// Einträge mit dieser absenceId und die Abwesenheit selbst. Timewarp-
// Abwesenheiten verwaltet der Abgleich, sie lassen sich hier nicht löschen.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  try {
    // Längere Wartezeit als die Standard-5-s: ein laufender Kalender-Abgleich
    // hält dieselbe Sperre auch während seiner Timing-Aufrufe
    const result = await prisma.$transaction(
      async (tx) => {
        // Dieselbe Sperre wie Dialog und Abgleich
        await withUserAbsenceLock(tx, userId);
        const absence = await tx.absence.findFirst({
          where: { id, userId },
          select: { id: true, source: true },
        });
        if (!absence) return { status: "notFound" as const };
        if (absence.source !== AbsenceSource.MANUAL) {
          return { status: "notManual" as const };
        }
        const deleted = await tx.timeEntry.deleteMany({
          where: { userId, absenceId: absence.id },
        });
        await tx.absence.delete({ where: { id: absence.id } });
        return { status: "deleted" as const, deletedEntries: deleted.count };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    if (result.status === "notFound") {
      return NextResponse.json(
        { error: "Abwesenheit nicht gefunden" },
        { status: 404 },
      );
    }
    if (result.status === "notManual") {
      return NextResponse.json(
        {
          error:
            "Abwesenheiten aus Timewarp lassen sich nur in Timewarp stornieren.",
        },
        { status: 409 },
      );
    }

    overtimeService.invalidateCache(userId);
    return NextResponse.json({ deletedEntries: result.deletedEntries });
  } catch (error) {
    console.error("Fehler beim Löschen der Abwesenheit:", error);
    return NextResponse.json(
      { error: "Die Abwesenheit konnte nicht gelöscht werden." },
      { status: 500 },
    );
  }
}
