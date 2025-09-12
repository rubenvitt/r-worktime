import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { bulkFillService } from "@/services/bulk-fill.service";

// Validation Schema
const bulkFillSchema = z.object({
  startDate: z.string().refine((date) => !Number.isNaN(Date.parse(date)), {
    message: "Ungültiges Startdatum",
  }),
  endDate: z.string().refine((date) => !Number.isNaN(Date.parse(date)), {
    message: "Ungültiges Enddatum",
  }),
  dailyHours: z.number().min(0.25).max(24),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: "Ungültiges Zeitformat (HH:MM erwartet)",
  }),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: "Ungültiges Zeitformat (HH:MM erwartet)",
  }),
  description: z.string().optional(),
  skipExisting: z.boolean(),
  preview: z.boolean().optional(), // Optional flag für Preview-Modus
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Validiere Request
    const validationResult = bulkFillSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.flatten(),
        },
        { status: 400 },
      );
    }

    const data = validationResult.data;

    // Konvertiere String-Dates zu Date-Objekten
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    // Zusätzliche Validierung
    if (startDate > endDate) {
      return NextResponse.json(
        { error: "Startdatum muss vor dem Enddatum liegen" },
        { status: 400 },
      );
    }

    // Max 1 Jahr Zeitraum
    const daysDiff = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysDiff > 365) {
      return NextResponse.json(
        { error: "Maximaler Zeitraum ist 1 Jahr" },
        { status: 400 },
      );
    }

    // Wenn Preview-Flag gesetzt ist, nur Vorschau zurückgeben
    if (data.preview) {
      const preview = await bulkFillService.previewBulkFill({
        userId: session.user.id,
        startDate,
        endDate,
        dailyHours: data.dailyHours,
        startTime: data.startTime,
        endTime: data.endTime,
        description: data.description,
        skipExisting: data.skipExisting,
      });

      return NextResponse.json({
        preview: true,
        ...preview,
        totalDays: daysDiff + 1,
        message: `Es werden ${preview.created} Arbeitstage befüllt (${preview.skipped} übersprungen)`,
      });
    }

    // Führe Bulk-Fill aus
    const result = await bulkFillService.fillWorkdays({
      userId: session.user.id,
      startDate,
      endDate,
      dailyHours: data.dailyHours,
      startTime: data.startTime,
      endTime: data.endTime,
      description: data.description,
      skipExisting: data.skipExisting,
    });

    // Invalidiere Overtime Cache
    try {
      await fetch(new URL("/api/statistics/overtime", request.url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invalidateCache" }),
      });
    } catch (error) {
      console.warn("Konnte Overtime Cache nicht invalidieren:", error);
    }

    return NextResponse.json({
      success: true,
      ...result,
      message: `${result.created} Zeiteinträge wurden erfolgreich erstellt`,
    });
  } catch (error) {
    console.error("Fehler beim Bulk-Fill:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Fehler beim Befüllen der Arbeitstage" },
      { status: 500 },
    );
  }
}
