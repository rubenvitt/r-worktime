import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { overtimeService } from "@/services/overtime.service";
import { EntryType } from "@/types/database";

interface BackupStatistics {
  totalEntries: number;
  dateRange: {
    start: string;
    end: string;
  };
  totalWorkHours: number;
}

interface UserProfile {
  id: string;
  email: string;
  name?: string;
}

interface UserSettings {
  weeklyWorkHours: number;
  workDays: number[];
  defaultStartTime: string;
  defaultEndTime: string;
  breakDuration: number;
  timezone: string;
  overtimeNotification: boolean;
  language: string;
  theme: string;
}

interface BackupData {
  backupInfo: {
    version: string;
    format: string;
    created: string;
    userId: string;
    statistics?: BackupStatistics;
  };
  userData: {
    profile: UserProfile;
    settings?: UserSettings;
    entries: Array<{
      id?: string;
      date: string;
      startTime: string;
      endTime: string;
      duration: string;
      type: EntryType;
      description?: string | null;
      createdAt?: string;
      updatedAt?: string;
    }>;
  };
}

// POST - Restore backup
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      backupData,
      options = {},
    }: {
      backupData: BackupData;
      options: {
        replaceExisting?: boolean;
        restoreSettings?: boolean;
        dateRange?: { from?: string; to?: string };
      };
    } = body;

    // Validate backup format
    if (
      !backupData.backupInfo ||
      backupData.backupInfo.format !== "r-worktime-backup"
    ) {
      return NextResponse.json(
        { error: "Invalid backup format" },
        { status: 400 },
      );
    }

    if (!backupData.userData || !Array.isArray(backupData.userData.entries)) {
      return NextResponse.json(
        { error: "Invalid backup data structure" },
        { status: 400 },
      );
    }

    const {
      replaceExisting = false,
      restoreSettings = false,
      dateRange,
    } = options;
    const results = {
      entriesProcessed: 0,
      entriesCreated: 0,
      entriesUpdated: 0,
      entriesSkipped: 0,
      settingsRestored: false,
      errors: [] as string[],
    };

    // Start transaction
    await prisma.$transaction(async (tx) => {
      // Clear existing data if requested
      if (replaceExisting) {
        await tx.timeEntry.deleteMany({
          where: { userId: session.user.id },
        });

        if (restoreSettings && backupData.userData.settings) {
          await tx.userSettings.deleteMany({
            where: { userId: session.user.id },
          });
        }
      }

      // Restore settings
      if (restoreSettings && backupData.userData.settings) {
        try {
          const settings = backupData.userData.settings;
          await tx.userSettings.upsert({
            where: { userId: session.user.id },
            create: {
              userId: session.user.id,
              weeklyWorkHours: settings.weeklyWorkHours,
              workDays: settings.workDays || [1, 2, 3, 4, 5],
              defaultStartTime: settings.defaultStartTime || "09:00",
              defaultEndTime: settings.defaultEndTime || "17:00",
              breakDuration: settings.breakDuration || 0.5,
              timezone: settings.timezone || "Europe/Berlin",
              overtimeNotification: settings.overtimeNotification ?? true,
              language: settings.language || "de",
              theme: settings.theme || "light",
            },
            update: {
              weeklyWorkHours: settings.weeklyWorkHours,
              workDays: settings.workDays || [1, 2, 3, 4, 5],
              defaultStartTime: settings.defaultStartTime || "09:00",
              defaultEndTime: settings.defaultEndTime || "17:00",
              breakDuration: settings.breakDuration || 0.5,
              timezone: settings.timezone || "Europe/Berlin",
              overtimeNotification: settings.overtimeNotification ?? true,
              language: settings.language || "de",
              theme: settings.theme || "light",
            },
          });
          results.settingsRestored = true;
        } catch (error) {
          results.errors.push(`Failed to restore settings: ${error}`);
        }
      }

      // Restore entries
      for (const entry of backupData.userData.entries) {
        try {
          results.entriesProcessed++;

          // Validate entry data
          if (
            !entry.date ||
            !entry.startTime ||
            !entry.endTime ||
            !entry.duration ||
            !entry.type
          ) {
            results.entriesSkipped++;
            results.errors.push(`Invalid entry data: missing required fields`);
            continue;
          }

          // Validate entry type
          if (!Object.values(EntryType).includes(entry.type)) {
            results.entriesSkipped++;
            results.errors.push(`Invalid entry type: ${entry.type}`);
            continue;
          }

          // Date range filter
          const entryDate = new Date(entry.date);
          if (dateRange) {
            if (dateRange.from && entryDate < new Date(dateRange.from)) {
              results.entriesSkipped++;
              continue;
            }
            if (dateRange.to && entryDate > new Date(dateRange.to)) {
              results.entriesSkipped++;
              continue;
            }
          }

          const entryData = {
            userId: session.user.id,
            date: new Date(entry.date),
            startTime: new Date(entry.startTime),
            endTime: new Date(entry.endTime),
            duration: parseFloat(entry.duration),
            type: entry.type,
            description: entry.description || null,
          };

          if (replaceExisting || !entry.id) {
            // Create new entry
            await tx.timeEntry.create({
              data: entryData,
            });
            results.entriesCreated++;
          } else {
            // Try to find existing entry
            const existingEntry = await tx.timeEntry.findFirst({
              where: {
                userId: session.user.id,
                date: entryData.date,
                startTime: entryData.startTime,
              },
            });

            if (existingEntry) {
              await tx.timeEntry.update({
                where: { id: existingEntry.id },
                data: entryData,
              });
              results.entriesUpdated++;
            } else {
              await tx.timeEntry.create({
                data: entryData,
              });
              results.entriesCreated++;
            }
          }
        } catch (error) {
          results.entriesSkipped++;
          results.errors.push(`Failed to process entry: ${error}`);
        }
      }
    });

    // Invalidiere Overtime Cache nach Backup Restore
    overtimeService.invalidateCache(session.user.id);

    return NextResponse.json({
      success: true,
      message: "Backup restored successfully",
      results,
    });
  } catch (error) {
    console.error("Error restoring backup:", error);
    return NextResponse.json(
      { error: "Failed to restore backup" },
      { status: 500 },
    );
  }
}

// PUT - Preview restore (dry run)
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { backupData }: { backupData: BackupData } = body;

    // Validate backup format
    if (
      !backupData.backupInfo ||
      backupData.backupInfo.format !== "r-worktime-backup"
    ) {
      return NextResponse.json(
        { error: "Invalid backup format" },
        { status: 400 },
      );
    }

    if (!backupData.userData || !Array.isArray(backupData.userData.entries)) {
      return NextResponse.json(
        { error: "Invalid backup data structure" },
        { status: 400 },
      );
    }

    // Analyze backup contents
    const entries = backupData.userData.entries;
    const validEntries = entries.filter(
      (entry) =>
        entry.date &&
        entry.startTime &&
        entry.endTime &&
        entry.duration &&
        entry.type &&
        Object.values(EntryType).includes(entry.type),
    );

    const dateRange =
      validEntries.length > 0
        ? {
            from: validEntries.reduce(
              (min, entry) => (entry.date < min ? entry.date : min),
              validEntries[0].date,
            ),
            to: validEntries.reduce(
              (max, entry) => (entry.date > max ? entry.date : max),
              validEntries[0].date,
            ),
          }
        : null;

    const entryTypes = validEntries.reduce(
      (acc, entry) => {
        acc[entry.type] = (acc[entry.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return NextResponse.json({
      backupInfo: backupData.backupInfo,
      preview: {
        totalEntries: entries.length,
        validEntries: validEntries.length,
        invalidEntries: entries.length - validEntries.length,
        hasSettings: !!backupData.userData.settings,
        dateRange,
        entryTypes,
        warnings:
          entries.length !== validEntries.length
            ? [
                `${entries.length - validEntries.length} entries have invalid data and will be skipped`,
              ]
            : [],
      },
    });
  } catch (error) {
    console.error("Error previewing backup:", error);
    return NextResponse.json(
      { error: "Failed to preview backup" },
      { status: 500 },
    );
  }
}
