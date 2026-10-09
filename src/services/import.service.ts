import { EntrySource, type EntryType, ImportStatus } from "@prisma/client";
import { parseISO } from "date-fns";
import { berlinDayStart, dateKeyFromIsoTimestamp } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  detectEntryType,
  parseDurationToHours,
  type TimingEntry,
  type TimingExport,
} from "@/lib/schemas/timing-import";
import { joinTitleChain, splitProjectPath } from "@/lib/timing/project-path";

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

/** Quellen, die ein Datei-Import pro Tag ersetzen darf. */
export const REPLACEABLE_IMPORT_SOURCES: EntrySource[] = [
  EntrySource.FILE_IMPORT,
  EntrySource.TIMING_SYNC,
];

export class DuplicateImportError extends Error {
  constructor() {
    super("Duplicate import detected. Use force option to override.");
    this.name = "DuplicateImportError";
  }
}

export interface MappedTimingEntry {
  dateKey: string;
  userId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  duration: number;
  type: EntryType;
  description: string | null;
  title: string | null;
  notes: string | null;
  projectPath: string | null;
  externalId: string | null;
  source: EntrySource;
  billingStatus: string | null;
  importLogId: string | null;
}

/**
 * Wandelt einen Eintrag aus dem Timing-JSON-Export in einen TimeEntry-Datensatz.
 * Tag = Berlin-Kalendertag des Starts.
 */
export function mapTimingEntry(
  entry: TimingEntry,
  userId: string,
  importLogId: string | null,
): MappedTimingEntry {
  const startTime = parseISO(entry.startDate);
  const endTime = parseISO(entry.endDate);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new Error(`Invalid start or end date: ${entry.startDate}`);
  }

  const dateKey = dateKeyFromIsoTimestamp(entry.startDate);
  const title = entry.activityTitle?.trim() || null;
  const notes = entry.notes?.trim() || null;
  const projectPath = joinTitleChain(splitProjectPath(entry.project)) || null;

  return {
    dateKey,
    userId,
    date: berlinDayStart(dateKey),
    startTime,
    endTime,
    duration: parseDurationToHours(entry.duration),
    type: detectEntryType(entry.project),
    // Kompatibilität: Suche und Anzeige nutzen weiterhin description
    description: [title, notes].filter(Boolean).join(" - ") || null,
    title,
    notes,
    projectPath,
    externalId: entry.id?.trim() || null,
    source: EntrySource.FILE_IMPORT,
    billingStatus: entry.billingStatus || null,
    importLogId,
  };
}

/** Berlin-Tag eines Export-Eintrags; null, wenn der Zeitstempel unbrauchbar ist. */
export function timingEntryDateKey(entry: TimingEntry): string | null {
  try {
    return dateKeyFromIsoTimestamp(entry.startDate);
  } catch {
    return null;
  }
}

/** Lässt Zeilen weg, deren Timing-ID schon an einem geschützten Eintrag hängt. */
export function skipProtectedEntries<T extends { externalId: string | null }>(
  rows: T[],
  protectedIds: Array<string | null>,
): T[] {
  const ids = new Set(protectedIds.filter((id): id is string => !!id));
  if (ids.size === 0) return rows;
  return rows.filter((row) => !row.externalId || !ids.has(row.externalId));
}

export function getTimingEntries(timingData: TimingExport): TimingEntry[] {
  return Array.isArray(timingData) ? timingData : timingData.entries;
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
   * Process Timing export with transaction.
   * Ersetzt pro Tag nur Einträge aus Datei-Import oder Timing-Sync –
   * manuelle Einträge, Feiertage, Bulk-Fill und Saldo bleiben erhalten.
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
        throw new DuplicateImportError();
      }
    }

    const errors: string[] = [];
    let skippedEntries = 0;

    const entries = getTimingEntries(timingData);
    const metadata = Array.isArray(timingData)
      ? {}
      : {
          dateRange: timingData.dateRange,
          version: timingData.version,
          exportedAt: timingData.exportedAt,
        };

    // Erst alles mappen (reines JS): DB-Fehler brechen die Transaktion ohnehin
    // komplett ab, deshalb dort kein Fangen pro Eintrag.
    const mapped: MappedTimingEntry[] = [];
    const seenExternalIds = new Set<string>();
    for (const entry of entries) {
      try {
        const row = mapTimingEntry(entry, user.id, null);
        if (row.externalId) {
          if (seenExternalIds.has(row.externalId)) {
            throw new Error("duplicate id in file");
          }
          seenExternalIds.add(row.externalId);
        }
        mapped.push(row);
      } catch (entryError) {
        const entryIdentifier = entry.id || entry.activityTitle || "unknown";
        errors.push(
          `Failed to process entry ${entryIdentifier}: ${
            entryError instanceof Error ? entryError.message : "Unknown error"
          }`,
        );
        skippedEntries++;
      }
    }

    const dateKeys = Array.from(new Set(mapped.map((row) => row.dateKey)));
    const externalIds = Array.from(seenExternalIds);

    const { importLogId, replacedEntries, createdEntries, keptEntries } =
      await prisma.$transaction(async (tx) => {
        const logData = {
          fileName: options.fileName,
          rowCount: entries.length,
          status: ImportStatus.PENDING,
          metadata,
        };

        const importLog = options.force
          ? await tx.importLog.upsert({
              where: {
                userId_fileHash: {
                  userId: user.id,
                  fileHash: options.fileHash,
                },
              },
              update: { ...logData, importDate: new Date() },
              create: {
                ...logData,
                userId: user.id,
                fileHash: options.fileHash,
              },
            })
          : await tx.importLog.create({
              data: {
                ...logData,
                userId: user.id,
                fileHash: options.fileHash,
              },
            });

        let replaced = 0;
        if (dateKeys.length > 0) {
          const deleted = await tx.timeEntry.deleteMany({
            where: {
              userId: user.id,
              source: { in: REPLACEABLE_IMPORT_SOURCES },
              date: { in: dateKeys.map(berlinDayStart) },
            },
          });
          replaced += deleted.count;
        }

        // Gleiche ID an anderem Tag (in Timing verschoben) ebenfalls ersetzen,
        // sonst kollidiert der Unique-Key (userId, externalId).
        if (externalIds.length > 0) {
          const moved = await tx.timeEntry.deleteMany({
            where: {
              userId: user.id,
              source: { in: REPLACEABLE_IMPORT_SOURCES },
              externalId: { in: externalIds },
            },
          });
          replaced += moved.count;
        }

        // Was jetzt noch eine der IDs trägt, ist geschützt (z. B. manuell
        // korrigierter Timing-Eintrag): behalten statt doppelt anlegen.
        let toCreate = mapped;
        if (externalIds.length > 0) {
          const kept = await tx.timeEntry.findMany({
            where: { userId: user.id, externalId: { in: externalIds } },
            select: { externalId: true },
          });
          toCreate = skipProtectedEntries(
            mapped,
            kept.map((row) => row.externalId),
          );
        }

        if (toCreate.length > 0) {
          await tx.timeEntry.createMany({
            data: toCreate.map(({ dateKey: _dateKey, ...row }) => ({
              ...row,
              importLogId: importLog.id,
            })),
          });
        }

        const finalStatus =
          errors.length === 0
            ? ImportStatus.SUCCESS
            : mapped.length > 0
              ? ImportStatus.PARTIAL
              : ImportStatus.FAILED;

        await tx.importLog.update({
          where: { id: importLog.id },
          data: {
            status: finalStatus,
            errorMessage: errors.length > 0 ? errors.join("; ") : null,
          },
        });

        return {
          importLogId: importLog.id,
          replacedEntries: replaced,
          createdEntries: toCreate.length,
          keptEntries: mapped.length - toCreate.length,
        };
      });

    return {
      importLogId,
      processedEntries: mapped.length,
      createdEntries,
      replacedEntries,
      skippedEntries: skippedEntries + keptEntries,
      errors,
    };
  }
}
