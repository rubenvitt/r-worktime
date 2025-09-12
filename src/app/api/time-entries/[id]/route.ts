import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { overtimeService } from "@/services/overtime.service";
import { EntryType } from "@/types/database";

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

    // Delete the entry
    await prisma.timeEntry.delete({
      where: { id: entryId },
    });

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

    // Update the entry
    const updatedEntry = await prisma.timeEntry.update({
      where: { id },
      data: {
        date: new Date(body.date),
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
        duration: parseFloat(body.duration.toString()),
        type: body.type,
        description: body.description || null,
        updatedAt: new Date(),
      },
    });

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
