import type { Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EntryType } from "@/types/database";

// Export format type
type ExportFormat = "json" | "csv" | "excel";

// Helper function to format date for CSV
const formatDateForCSV = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

// Helper function to format time for CSV
const formatTimeForCSV = (date: Date): string => {
  return date.toTimeString().split(" ")[0].substring(0, 5);
};

// Type for time entry
type TimeEntryExport = {
  id: string;
  date: Date;
  startTime: Date;
  endTime: Date | null;
  type: EntryType;
  project: string | null;
  task: string | null;
  description: string | null;
  workHours: Prisma.Decimal;
  breakDuration: Prisma.Decimal;
};

// Helper function to convert to CSV
const convertToCSV = (entries: TimeEntryExport[]): string => {
  if (entries.length === 0) return "";

  const headers = [
    "Date",
    "Start Time",
    "End Time",
    "Duration (Hours)",
    "Type",
    "Description",
  ];
  const csvRows = [headers.join(",")];

  entries.forEach((entry) => {
    const row = [
      formatDateForCSV(new Date(entry.date)),
      formatTimeForCSV(new Date(entry.startTime)),
      formatTimeForCSV(new Date(entry.endTime)),
      entry.duration.toString(),
      entry.type,
      entry.description ? `"${entry.description.replace(/"/g, '""')}"` : "",
    ];
    csvRows.push(row.join(","));
  });

  return csvRows.join("\n");
};

// Helper function to convert to JSON (Timing compatible format)
const convertToTimingJSON = (
  entries: TimeEntryExport[],
): Array<Record<string, unknown>> => {
  return entries.map((entry) => ({
    date: formatDateForCSV(new Date(entry.date)),
    startTime: formatTimeForCSV(new Date(entry.startTime)),
    endTime: formatTimeForCSV(new Date(entry.endTime)),
    duration: parseFloat(entry.duration.toString()),
    type: entry.type,
    projectName: entry.description || "",
    description: entry.description || "",
    entryId: entry.id,
  }));
};

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "json") as ExportFormat;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const type = searchParams.get("type") as EntryType | null;
    const includeSettings = searchParams.get("includeSettings") === "true";

    // Validate format
    if (!["json", "csv", "excel"].includes(format)) {
      return NextResponse.json(
        { error: "Invalid format. Supported formats: json, csv, excel" },
        { status: 400 },
      );
    }

    // Build where clause
    const where: Prisma.TimeEntryWhereInput = {
      userId: session.user.id,
    };

    // Date range filter
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        where.date.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.date.lte = new Date(dateTo);
      }
    }

    // Type filter
    if (type && Object.values(EntryType).includes(type)) {
      where.type = type;
    }

    // Get entries
    const entries = await prisma.timeEntry.findMany({
      where,
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        duration: true,
        type: true,
        description: true,
        createdAt: true,
      },
      orderBy: { date: "asc" },
    });

    // Check export size limit (50MB rough estimate)
    if (entries.length > 50000) {
      return NextResponse.json(
        {
          error:
            "Export too large. Maximum 50,000 entries allowed. Please filter by date range.",
        },
        { status: 400 },
      );
    }

    let exportData: string | Record<string, unknown>;
    let contentType: string;
    let filename: string;

    const dateRangeStr =
      dateFrom && dateTo
        ? `_${dateFrom}_to_${dateTo}`
        : dateFrom
          ? `_from_${dateFrom}`
          : dateTo
            ? `_to_${dateTo}`
            : "";

    switch (format) {
      case "csv":
        exportData = convertToCSV(entries);
        contentType = "text/csv";
        filename = `time-entries${dateRangeStr}.csv`;
        break;

      case "excel":
        // For now, return CSV with Excel MIME type
        // In a real implementation, you'd use a library like 'xlsx'
        exportData = convertToCSV(entries);
        contentType = "application/vnd.ms-excel";
        filename = `time-entries${dateRangeStr}.csv`;
        break;
      default: {
        const jsonData: Record<string, unknown> = {
          exportInfo: {
            format: "r-worktime",
            version: "1.0",
            exportDate: new Date().toISOString(),
            entryCount: entries.length,
            dateRange: {
              from: dateFrom || null,
              to: dateTo || null,
            },
          },
          entries: convertToTimingJSON(entries),
        };

        // Include user settings if requested
        if (includeSettings) {
          const userSettings = await prisma.userSettings.findUnique({
            where: { userId: session.user.id },
          });
          jsonData.settings = userSettings;
        }

        exportData = JSON.stringify(jsonData, null, 2);
        contentType = "application/json";
        filename = `time-entries${dateRangeStr}.json`;
        break;
      }
    }

    // Return file download response
    const response = new NextResponse(exportData, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });

    return response;
  } catch (error) {
    console.error("Error exporting time entries:", error);
    return NextResponse.json(
      { error: "Failed to export time entries" },
      { status: 500 },
    );
  }
}
