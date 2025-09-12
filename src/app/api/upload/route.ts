import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { timingExportSchema } from "@/lib/schemas/timing-import";
import { ImportService } from "@/services/import.service";

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
    const entries = Array.isArray(timingData) ? timingData : timingData.entries;
    if (!entries || entries.length === 0) {
      return NextResponse.json(
        { error: "No entries found in the file" },
        { status: 400 },
      );
    }

    // Initialize import service
    const importService = new ImportService();

    // Check for duplicate import
    const isDuplicate = await importService.checkDuplicateImport(
      session.user.email,
      fileHash,
    );

    if (isDuplicate && !formData.get("force")) {
      // Return preview with duplicate warning
      const preview = await importService.analyzeImport(
        session.user.email,
        timingData,
      );

      return NextResponse.json({
        status: "duplicate_warning",
        message: "This file has already been imported",
        fileHash,
        preview,
        requiresConfirmation: true,
      });
    }

    // Analyze import for preview
    const preview = await importService.analyzeImport(
      session.user.email,
      timingData,
    );

    // If confirmation is provided, process the import
    const shouldProcess = formData.get("confirm") === "true";

    if (shouldProcess) {
      // Process the import with transaction
      const result = await importService.processTimingExport(
        session.user.email,
        timingData,
        {
          fileName: file.name,
          fileHash,
          force: formData.get("force") === "true",
        },
      );

      return NextResponse.json({
        status: "success",
        message: "Import completed successfully",
        result,
      });
    }

    // Return preview for confirmation
    return NextResponse.json({
      status: "preview",
      message: "Import preview ready",
      fileHash,
      fileName: file.name,
      preview,
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
