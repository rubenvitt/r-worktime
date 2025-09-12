import { type EntryType, ImportStatus, PrismaClient } from "@prisma/client";
import { parseISO } from "date-fns";
import {
  detectEntryType,
  parseDurationToHours,
  type TimingEntry,
  type TimingExport,
} from "@/lib/schemas/timing-import";

const prisma = new PrismaClient();

export interface ImportPreview {
  totalEntries: number;
  newEntries: number;
  replacedEntries: number;
  affectedDates: string[];
  duplicateWarnings: string[];
  entryTypeBreakdown: Record<EntryType, number>;
  estimatedHours: number;
}

export interface ImportResult {
  importLogId: string;
  processedEntries: number;
  createdEntries: number;
  replacedEntries: number;
  skippedEntries: number;
  errors: string[];
}

export interface ImportOptions {
  fileName: string;
  fileHash: string;
  force?: boolean;
}

export class ImportService {
  /**
   * Check if a file has already been imported
   */
  async checkDuplicateImport(
    userEmail: string,
    fileHash: string,
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const existingImport = await prisma.importLog.findUnique({
      where: {
        userId_fileHash: {
          userId: user.id,
          fileHash,
        },
      },
    });

    return !!existingImport;
  }

  /**
   * Analyze import data without persisting to database
   */
  async analyzeImport(
    userEmail: string,
    timingData: TimingExport,
  ): Promise<ImportPreview> {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const affectedDatesSet = new Set<string>();
    const entryTypeBreakdown: Record<EntryType, number> = {
      WORK: 0,
      OVERTIME: 0,
      VACATION: 0,
      SICK: 0,
      HOLIDAY: 0,
    };
    let estimatedHours = 0;
    const duplicateWarnings: string[] = [];

    // Handle both array and object format
    const entries = Array.isArray(timingData) ? timingData : timingData.entries;

    // Analyze each entry
    for (const entry of entries) {
      // Use just the date portion from the ISO string to avoid timezone issues
      const dateStr = entry.startDate.split("T")[0]; // "2025-09-01"
      affectedDatesSet.add(dateStr);

      const entryType = detectEntryType(entry.project);
      entryTypeBreakdown[entryType]++;

      estimatedHours += parseDurationToHours(entry.duration);
    }

    // Check for existing entries on affected dates
    const existingEntries = await prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        date: {
          in: Array.from(affectedDatesSet).map((d) => new Date(d)),
        },
      },
      select: {
        date: true,
        startTime: true,
        endTime: true,
      },
    });

    // Group existing entries by date for counting
    const existingByDate = new Map<string, number>();
    let totalExistingEntries = 0;

    existingEntries.forEach((entry) => {
      const dateKey = entry.date.toISOString().split("T")[0];
      existingByDate.set(dateKey, (existingByDate.get(dateKey) || 0) + 1);
      totalExistingEntries++;
    });

    // Calculate replacements - all existing entries for these dates will be replaced
    const replacedEntries = totalExistingEntries;

    // Generate warnings for dates with existing entries
    affectedDatesSet.forEach((date) => {
      const existing = existingByDate.get(date) || 0;
      if (existing > 0) {
        duplicateWarnings.push(
          `${date}: ${existing} existing entries will be replaced`,
        );
      }
    });

    return {
      totalEntries: entries.length,
      newEntries: entries.length - replacedEntries,
      replacedEntries,
      affectedDates: Array.from(affectedDatesSet).sort(),
      duplicateWarnings,
      entryTypeBreakdown,
      estimatedHours: Number(estimatedHours.toFixed(2)),
    };
  }

  /**
   * Process Timing export with transaction
   */
  async processTimingExport(
    userEmail: string,
    timingData: TimingExport,
    options: ImportOptions,
  ): Promise<ImportResult> {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Check for duplicate import unless forced
    if (!options.force) {
      const isDuplicate = await this.checkDuplicateImport(
        userEmail,
        options.fileHash,
      );
      if (isDuplicate) {
        throw new Error(
          "Duplicate import detected. Use force option to override.",
        );
      }
    }

    const errors: string[] = [];
    let processedEntries = 0;
    let createdEntries = 0;
    let replacedEntries = 0;
    let skippedEntries = 0;

    // Handle both array and object format
    const entries = Array.isArray(timingData) ? timingData : timingData.entries;
    const metadata = Array.isArray(timingData)
      ? {}
      : {
          dateRange: timingData.dateRange,
          version: timingData.version,
          exportedAt: timingData.exportedAt,
        };

    // Execute in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create or update import log
      let importLog: Awaited<ReturnType<typeof tx.importLog.create>>;

      if (options.force) {
        // When forcing, update existing import log or create new one
        importLog = await tx.importLog.upsert({
          where: {
            userId_fileHash: {
              userId: user.id,
              fileHash: options.fileHash,
            },
          },
          update: {
            fileName: options.fileName,
            rowCount: entries.length,
            status: ImportStatus.PENDING,
            importDate: new Date(),
            metadata,
          },
          create: {
            userId: user.id,
            fileName: options.fileName,
            fileHash: options.fileHash,
            rowCount: entries.length,
            status: ImportStatus.PENDING,
            metadata,
          },
        });
      } else {
        // Normal import - create new log
        importLog = await tx.importLog.create({
          data: {
            userId: user.id,
            fileName: options.fileName,
            fileHash: options.fileHash,
            rowCount: entries.length,
            status: ImportStatus.PENDING,
            metadata,
          },
        });
      }

      // Group entries by date for batch processing
      const entriesByDate = new Map<string, TimingEntry[]>();
      const allDatesInImport = new Set<string>();

      for (const entry of entries) {
        // Use just the date portion from the ISO string to avoid timezone issues
        const dateStr = entry.startDate.split("T")[0]; // "2025-09-01"
        allDatesInImport.add(dateStr);
        if (!entriesByDate.has(dateStr)) {
          entriesByDate.set(dateStr, []);
        }
        entriesByDate.get(dateStr)?.push(entry);
      }

      // When forcing, first delete ALL existing entries for ALL dates in this import
      if (options.force && allDatesInImport.size > 0) {
        const deleted = await tx.timeEntry.deleteMany({
          where: {
            userId: user.id,
            date: {
              in: Array.from(allDatesInImport).map((d) => new Date(d)),
            },
          },
        });

        if (deleted.count > 0) {
          replacedEntries = deleted.count;
        }
      }

      // Process each date
      for (const [dateStr, dateEntries] of entriesByDate) {
        const date = new Date(dateStr);

        try {
          // For non-force imports, delete existing entries for this date
          if (!options.force) {
            const deleted = await tx.timeEntry.deleteMany({
              where: {
                userId: user.id,
                date,
              },
            });

            if (deleted.count > 0) {
              replacedEntries += deleted.count;
            }
          }

          // Create new entries for this specific date
          for (const entry of dateEntries) {
            try {
              const timeEntry = this.parseTimingEntry(
                entry,
                user.id,
                importLog.id,
              );

              await tx.timeEntry.create({
                data: timeEntry,
              });

              createdEntries++;
              processedEntries++;
            } catch (entryError) {
              const error = `Failed to process entry ${entry.id}: ${
                entryError instanceof Error
                  ? entryError.message
                  : "Unknown error"
              }`;
              errors.push(error);
              skippedEntries++;
            }
          }
        } catch (dateError) {
          const error = `Failed to process date ${dateStr}: ${
            dateError instanceof Error ? dateError.message : "Unknown error"
          }`;
          errors.push(error);
          skippedEntries += entries.length;
        }
      }

      // Update import log status
      const finalStatus =
        errors.length === 0
          ? ImportStatus.SUCCESS
          : processedEntries > 0
            ? ImportStatus.PARTIAL
            : ImportStatus.FAILED;

      await tx.importLog.update({
        where: { id: importLog.id },
        data: {
          status: finalStatus,
          errorMessage: errors.length > 0 ? errors.join("; ") : null,
        },
      });

      return importLog;
    });

    return {
      importLogId: result.id,
      processedEntries,
      createdEntries,
      replacedEntries,
      skippedEntries,
      errors,
    };
  }

  /**
   * Parse Timing entry to database format
   */
  private parseTimingEntry(
    entry: TimingEntry,
    userId: string,
    importLogId: string,
  ) {
    const startTime = parseISO(entry.startDate);
    const endTime = parseISO(entry.endDate);

    // Use the date from the LOCAL perspective, not UTC
    // If the entry starts at 04:09 UTC on Sept 1st, it's actually Aug 31st at 06:09 in CEST
    // But we want to store it as Sept 1st (the date shown in Timing)
    // So we extract just the date portion from the ISO string
    const dateStr = entry.startDate.split("T")[0]; // "2025-09-01"
    const date = parseISO(`${dateStr}T00:00:00.000Z`);

    const duration = parseDurationToHours(entry.duration);
    const type = detectEntryType(entry.project);

    // Build description from activity title and notes
    let description = entry.activityTitle;
    if (entry.notes) {
      description += ` - ${entry.notes}`;
    }

    return {
      userId,
      date,
      startTime,
      endTime,
      duration,
      type,
      description,
      importLogId,
    };
  }
}
