import { EntryType } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const adjustmentSchema = z.object({
  date: z.string().transform((val) => new Date(val)),
  hours: z.number(),
  description: z.string(),
  type: z.literal("ADJUSTMENT").optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Auth Check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = adjustmentSchema.parse(body);

    // Check if an adjustment entry already exists for this user
    const existingAdjustment = await prisma.timeEntry.findFirst({
      where: {
        userId: session.user.id,
        description: {
          contains: "Anfangs-Überstunden-Saldo",
        },
      },
    });

    if (existingAdjustment) {
      // Update existing adjustment
      const updated = await prisma.timeEntry.update({
        where: { id: existingAdjustment.id },
        data: {
          date: validatedData.date,
          duration: new Decimal(validatedData.hours),
          startTime: validatedData.date,
          endTime: validatedData.date,
        },
      });

      return NextResponse.json({
        message: "Adjustment entry updated",
        entry: updated,
      });
    } else {
      // Create new adjustment entry
      const created = await prisma.timeEntry.create({
        data: {
          userId: session.user.id,
          date: validatedData.date,
          startTime: validatedData.date,
          endTime: validatedData.date,
          duration: new Decimal(validatedData.hours),
          type: EntryType.OVERTIME,
          description: validatedData.description,
        },
      });

      return NextResponse.json({
        message: "Adjustment entry created",
        entry: created,
      });
    }
  } catch (error) {
    console.error("Error creating adjustment:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(_request: NextRequest) {
  try {
    // Auth Check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get existing adjustment entry
    const adjustment = await prisma.timeEntry.findFirst({
      where: {
        userId: session.user.id,
        description: {
          contains: "Anfangs-Überstunden-Saldo",
        },
      },
    });

    if (!adjustment) {
      return NextResponse.json({ adjustment: null });
    }

    return NextResponse.json({
      adjustment: {
        id: adjustment.id,
        date: adjustment.date,
        hours: adjustment.duration.toNumber(),
        description: adjustment.description,
      },
    });
  } catch (error) {
    console.error("Error fetching adjustment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
