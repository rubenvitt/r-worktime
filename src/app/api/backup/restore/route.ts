import type { EntrySource } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  absencesFromBackup,
  keepMissingSyncFields,
  type RestoredAbsence,
  resolveRestoreSource,
  restoreAbsenceId,
  settingsFromBackup,
  travelDaysFromBackup,
} from "@/lib/backup-restore";
import { berlinDayStart } from "@/lib/dates";
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

// Rohdaten aus dem Backup; alte Backups enthalten entfernte Felder,
// settingsFromBackup übernimmt nur die bekannten.
type BackupSettings = Record<string, unknown>;

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
    settings?: BackupSettings;
    entries: Array<{
      id?: string;
      date: string;
      startTime: string;
      endTime: string;
      duration: string;
      type: EntryType;
      description?: string | null;
      title?: string | null;
      notes?: string | null;
      projectPath?: string | null;
      externalId?: string | null;
      source?: EntrySource | null;
      billingStatus?: string | null;
      /** Verknüpfte Abwesenheit (ID im Backup); fehlt in älteren Backups */
      absenceId?: string | null;
      createdAt?: string;
      updatedAt?: string;
    }>;
    /** Reisetag-Festlegungen; fehlt in älteren Backups */
    travelDays?: Array<{ date: string; isTravel: boolean }>;
    /** Abwesenheiten; fehlt in älteren Backups */
    absences?: unknown[];
  };
}

/** Abwesenheit liegt (teilweise) im gewählten Zeitraum */
function absenceInRange(
  absence: RestoredAbsence,
  dateRange: { from?: string; to?: string } | undefined,
): boolean {
  if (
    dateRange?.to &&
    berlinDayStart(absence.startDate) > new Date(dateRange.to)
  )
    return false;
  if (
    dateRange?.from &&
    berlinDayStart(absence.endDate) < new Date(dateRange.from)
  )
    return false;
  return true;
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
    if (backupData.backupInfo?.format !== "r-worktime-backup") {
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
      travelDaysRestored: 0,
      travelDaysSkipped: 0,
      absencesRestored: 0,
      absencesSkipped: 0,
      errors: [] as string[],
    };
    // null = Backup ohne Reisetage (älteres Format) → nichts anfassen
    const travelDays = travelDaysFromBackup(backupData.userData);
    // null = Backup ohne Abwesenheiten (älteres Format) → nichts anfassen
    const absences = absencesFromBackup(backupData.userData);

    // Start transaction
    await prisma.$transaction(async (tx) => {
      // Clear existing data if requested
      if (replaceExisting) {
        await tx.timeEntry.deleteMany({
          where: { userId: session.user.id },
        });

        // Abwesenheiten nur ersetzen, wenn das Backup welche mitbringt
        if (absences !== null) {
          await tx.absence.deleteMany({
            where: { userId: session.user.id },
          });
        }

        // Festlegungen nur ersetzen, wenn das Backup welche mitbringt
        if (travelDays !== null) {
          await tx.travelDay.deleteMany({
            where: { userId: session.user.id },
          });
        }

        if (restoreSettings && backupData.userData.settings) {
          await tx.userSettings.deleteMany({
            where: { userId: session.user.id },
          });
        }
      }

      // Restore settings
      if (restoreSettings && backupData.userData.settings) {
        try {
          const settings = settingsFromBackup(backupData.userData.settings);
          await tx.userSettings.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, ...settings },
            update: settings,
          });
          results.settingsRestored = true;
        } catch (error) {
          results.errors.push(`Failed to restore settings: ${error}`);
        }
      }

      // Abwesenheiten vor den Einträgen: die neuen IDs ersetzen die alten
      // absenceId-Verweise. Timewarp-Abwesenheiten über ihre UID abgleichen,
      // manuelle über Art und Zeitraum, damit ein zweiter Restore nichts
      // verdoppelt.
      const restoredAbsenceIds = new Map<string, string>();
      for (const absence of absences ?? []) {
        if (!absenceInRange(absence, dateRange)) {
          results.absencesSkipped++;
          continue;
        }
        try {
          const data = {
            userId: session.user.id,
            source: absence.source,
            externalUid: absence.externalUid,
            kind: absence.kind,
            rawType: absence.rawType,
            startDate: berlinDayStart(absence.startDate),
            endDate: berlinDayStart(absence.endDate),
            halfDay: absence.halfDay,
            status: absence.status,
            sequence: absence.sequence,
            lastSeenAt: absence.lastSeenAt
              ? new Date(absence.lastSeenAt)
              : null,
          };
          const existing = absence.externalUid
            ? await tx.absence.findUnique({
                where: {
                  userId_externalUid: {
                    userId: session.user.id,
                    externalUid: absence.externalUid,
                  },
                },
                select: { id: true },
              })
            : await tx.absence.findFirst({
                where: {
                  userId: session.user.id,
                  source: absence.source,
                  externalUid: null,
                  kind: absence.kind,
                  startDate: data.startDate,
                  endDate: data.endDate,
                  halfDay: absence.halfDay,
                },
                select: { id: true },
              });
          const saved = existing
            ? await tx.absence.update({
                where: { id: existing.id },
                data,
                select: { id: true },
              })
            : await tx.absence.create({ data, select: { id: true } });
          restoredAbsenceIds.set(absence.id, saved.id);
          results.absencesRestored++;
        } catch (error) {
          results.absencesSkipped++;
          results.errors.push(`Failed to restore absence: ${error}`);
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

          // Ältere Backups kennen source noch nicht → Regeln der Migration
          const source = resolveRestoreSource(entry);
          const externalId = entry.externalId || null;

          const entryData = {
            userId: session.user.id,
            date: new Date(entry.date),
            startTime: new Date(entry.startTime),
            endTime: new Date(entry.endTime),
            duration: parseFloat(entry.duration),
            type: entry.type,
            description: entry.description || null,
            title: entry.title || null,
            notes: entry.notes || null,
            projectPath: entry.projectPath || null,
            externalId,
            source,
            billingStatus: entry.billingStatus || null,
            // undefined (älteres Backup) lässt eine vorhandene Verknüpfung stehen
            absenceId: restoreAbsenceId(entry, restoredAbsenceIds),
          };

          // Gleiche externe ID → vorhandenen Eintrag aktualisieren (Unique-Key)
          const existingByExternalId = externalId
            ? await tx.timeEntry.findUnique({
                where: {
                  userId_externalId: { userId: session.user.id, externalId },
                },
              })
            : null;

          if (existingByExternalId) {
            await tx.timeEntry.update({
              where: { id: existingByExternalId.id },
              data: entryData,
            });
            results.entriesUpdated++;
          } else if (replaceExisting || !entry.id) {
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
                data: keepMissingSyncFields(entryData, entry, existingEntry),
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

      // Reisetag-Festlegungen (Upsert je Tag, Zeitraumfilter wie bei Einträgen)
      for (const day of travelDays ?? []) {
        const date = berlinDayStart(day.date);
        if (
          (dateRange?.from && date < new Date(dateRange.from)) ||
          (dateRange?.to && date > new Date(dateRange.to))
        ) {
          results.travelDaysSkipped++;
          continue;
        }
        try {
          await tx.travelDay.upsert({
            where: { userId_date: { userId: session.user.id, date } },
            create: { userId: session.user.id, date, isTravel: day.isTravel },
            update: { isTravel: day.isTravel },
          });
          results.travelDaysRestored++;
        } catch (error) {
          results.travelDaysSkipped++;
          results.errors.push(`Failed to restore travel day: ${error}`);
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
    if (backupData.backupInfo?.format !== "r-worktime-backup") {
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
        travelDays: travelDaysFromBackup(backupData.userData)?.length ?? 0,
        absences: absencesFromBackup(backupData.userData)?.length ?? 0,
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
