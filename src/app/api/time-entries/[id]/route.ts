import { type NextRequest, NextResponse } from "next/server";
import { withUserAbsenceLock } from "@/lib/absences/lock";
import { suppressAbsenceDays } from "@/lib/absences/suppress";
import { auth } from "@/lib/auth";
import { keepExactTimes, manualEditOverrides } from "@/lib/manual-edit";
import { prisma } from "@/lib/prisma";
import { overtimeService } from "@/services/overtime.service";
import { EntryType } from "@/types/database";

// Wartet ggf. auf einen laufenden Kalender-Abgleich (gleiche Sperre)
const ABSENCE_TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: entryId } = await params;

    // Verify the entry exists and belongs to the user
    const entry = await prisma.timeEntry.findFirst({
      where: {
        id: entryId,
        userId: session.user.id,
      },
    });

    if (!entry) {
      return NextResponse.json(
        { error: "Entry not found or access denied" },
        { status: 404 },
      );
    }

    if (entry.absenceId) {
      // Tag einer Timewarp-Abwesenheit: als unterdrückt vermerken, damit der
      // Kalender-Abgleich ihn nicht neu anlegt
      const userId = session.user.id;
      await prisma.$transaction(async (tx) => {
        await withUserAbsenceLock(tx, userId);
        await tx.timeEntry.deleteMany({ where: { id: entryId, userId } });
        await suppressAbsenceDays(tx, userId, [entry]);
      }, ABSENCE_TX_OPTIONS);
    } else {
      await prisma.timeEntry.delete({
        where: { id: entryId },
      });
    }

    // Invalidiere Overtime Cache nach Löschen
    overtimeService.invalidateCache(session.user.id);

    return NextResponse.json({
      message: "Time entry deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting time entry:", error);
    return NextResponse.json(
      { error: "Failed to delete time entry" },
      { status: 500 },
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const entry = await prisma.timeEntry.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json(entry);
  } catch (error) {
    console.error("Error fetching time entry:", error);
    return NextResponse.json(
      { error: "Failed to fetch time entry" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify the entry exists and belongs to the user
    const existingEntry = await prisma.timeEntry.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingEntry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const body = await request.json();

    // Validate required fields
    const requiredFields = ["date", "startTime", "endTime", "duration", "type"];
    for (const field of requiredFields) {
      if (!(field in body)) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 },
        );
      }
    }

    // Validate entry type
    if (!Object.values(EntryType).includes(body.type)) {
      return NextResponse.json(
        { error: "Invalid entry type" },
        { status: 400 },
      );
    }

    const edit = keepExactTimes(existingEntry, {
      date: new Date(body.date),
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      duration: parseFloat(body.duration.toString()),
      type: body.type,
      description: (body.description || null) as string | null,
    });

    const overrides = manualEditOverrides(existingEntry, edit);
    const data = { ...edit, ...overrides, updatedAt: new Date() };
    const userId = session.user.id;

    // Bearbeiteter Timewarp-Eintrag: entkoppelt (siehe manualEditOverrides),
    // der ursprüngliche Tag wird an der Abwesenheit als unterdrückt vermerkt
    const updatedEntry =
      overrides.absenceId === null && existingEntry.absenceId
        ? await prisma.$transaction(async (tx) => {
            await withUserAbsenceLock(tx, userId);
            const updated = await tx.timeEntry.update({ where: { id }, data });
            await suppressAbsenceDays(tx, userId, [existingEntry]);
            return updated;
          }, ABSENCE_TX_OPTIONS)
        : await prisma.timeEntry.update({ where: { id }, data });

    // Invalidiere Overtime Cache nach Update
    overtimeService.invalidateCache(session.user.id);

    return NextResponse.json(updatedEntry);
  } catch (error) {
    console.error("Error updating time entry:", error);
    return NextResponse.json(
      { error: "Failed to update time entry" },
      { status: 500 },
    );
  }
}
