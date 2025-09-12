import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { previewCache } from "@/lib/preview-cache";
import { prisma } from "@/lib/prisma";
import { timingExportSchema } from "@/lib/schemas/timing-import";
import { ImportService } from "@/services/import.service";
import { ImportPreviewService } from "@/services/import-preview.service";

// 10MB file size limit
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    // Check if this is a confirmation request (two-step import)
    const previewId = formData.get("previewId") as string | null;
    const shouldConfirm = formData.get("confirm") === "true";

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (previewId && shouldConfirm) {
      // Retrieve cached preview data
      const cached = previewCache.get(previewId, user.id);

      if (!cached) {
        return NextResponse.json(
          {
            error:
              "Preview expired or not found. Please upload the file again.",
          },
          { status: 400 },
        );
      }

      // Process the import with the cached data
      const importService = new ImportService();

      // Generate fileHash from cached data for consistency
      const fileHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(cached.timingData))
        .digest("hex");

      const result = await importService.processTimingExport(
        session.user.email,
        cached.timingData,
        {
          fileName: cached.preview.metadata?.fileName || "import.json",
          fileHash,
          force: formData.get("force") === "true",
        },
      );

      // Clean up the preview cache
      previewCache.delete(previewId);

      return NextResponse.json({
        status: "success",
        message: "Import completed successfully",
        result,
      });
    }

    // For new uploads, validate file presence and format
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith(".json")) {
      return NextResponse.json(
        { error: "Only JSON files are supported" },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
        { status: 400 },
      );
    }

    // Read file content
    const fileContent = await file.text();

    // Generate file hash for duplicate detection
    const fileHash = crypto
      .createHash("sha256")
      .update(fileContent)
      .digest("hex");

    // Parse and validate JSON
    let parsedData: unknown;
    try {
      parsedData = JSON.parse(fileContent);
    } catch (_error) {
      return NextResponse.json(
        { error: "Invalid JSON format" },
        { status: 400 },
      );
    }

    // Validate against Timing export schema
    const validationResult = timingExportSchema.safeParse(parsedData);
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((err) => ({
        path: err.path.join("."),
        message: err.message,
      }));

      return NextResponse.json(
        {
          error: "Invalid Timing export format",
          details: errors,
        },
        { status: 400 },
      );
    }

    const timingData = validationResult.data;

    // Check if file has entries (handle both array and object format)
    const validationEntries = Array.isArray(timingData)
      ? timingData
      : timingData.entries;
    if (!validationEntries || validationEntries.length === 0) {
      return NextResponse.json(
        { error: "No entries found in the file" },
        { status: 400 },
      );
    }

    // Generate detailed preview
    const importService = new ImportService();
    const previewService = new ImportPreviewService();

    // Check for duplicate import
    const isDuplicate = await importService.checkDuplicateImport(
      session.user.email,
      fileHash,
    );

    // Get existing entries for comparison
    const affectedDates = new Set<string>();
    const entries = Array.isArray(timingData) ? timingData : timingData.entries;

    entries.forEach((entry) => {
      const dateStr = entry.startDate.split("T")[0];
      affectedDates.add(dateStr);
    });

    const existingEntries = await prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        date: {
          in: Array.from(affectedDates).map((d) => new Date(d)),
        },
      },
      orderBy: {
        startTime: "asc",
      },
    });

    // Generate detailed preview
    const detailedPreview = await previewService.generateDetailedPreview(
      timingData,
      existingEntries,
      {
        fileName: file.name,
        fileHash,
      },
    );

    // Add duplicate warning if applicable
    if (isDuplicate) {
      detailedPreview.warnings.unshift({
        type: "DUPLICATE",
        date: "",
        message: "Diese Datei wurde bereits importiert",
        severity: "warning",
        details: "Verwenden Sie 'force' um trotzdem zu importieren",
      });
    }

    // Cache the preview data for two-step import
    previewCache.set(detailedPreview.previewId, {
      preview: detailedPreview,
      timingData,
      userId: user.id,
    });

    // Return detailed preview for confirmation
    return NextResponse.json({
      status: "preview",
      message: "Import preview ready",
      preview: detailedPreview,
      isDuplicate,
      requiresConfirmation: true,
    });
  } catch (error) {
    console.error("Upload error:", error);

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    // Handle other errors
    return NextResponse.json(
      {
        error: "Failed to process upload",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
