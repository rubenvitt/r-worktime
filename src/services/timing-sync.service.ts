import {
  EntrySource,
  type Prisma,
  type TimingIntegration,
} from "@prisma/client";
import { suppressAbsenceDays } from "@/lib/absences/suppress";
import { decryptSecret } from "@/lib/crypto";
import {
  berlinDayStart,
  berlinTodayKey,
  dateKeyFromDbDate,
  isDateKey,
  shiftDateKey,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { createTimingClient, type DateRange } from "@/lib/timing/client";
import { MAX_SYNC_WINDOW_DAYS } from "@/lib/timing/constants";
import {
  type FilterStats,
  filterAndMapEntries,
  type SyncEntryData,
} from "@/lib/timing/mapping";
import { type ExistingEntry, planSync } from "@/lib/timing/plan-sync";
import { overtimeService } from "@/services/overtime.service";

export const SYNC_STATUS_SUCCESS = "SUCCESS";
export const SYNC_STATUS_FAILED = "FAILED";

/** Obergrenze für manuelle Zeiträume (Rate-Limit der API: 500 Requests/Stunde). */
export const MAX_SYNC_RANGE_DAYS = MAX_SYNC_WINDOW_DAYS;

const TRANSACTION_TIMEOUT_MS = 120_000;
const MAX_ERROR_LENGTH = 500;

export type SyncTrigger = "manual" | "scheduler";

export interface SyncStats {
  from: string;
  to: string;
  trigger: SyncTrigger;
  fetched: number;
  kept: number;
  skipped: FilterStats["skipped"];
  created: number;
  updated: number;
  unchanged: number;
  deleted: number;
  replacedFileImports: number;
  conflicts: number;
  durationMs: number;
}

export interface SyncOptions {
  trigger: SyncTrigger;
  /** Optionaler Zeitraum (Backfill); sonst das rollierende Fenster */
  range?: DateRange;
  /** Nur für Tests */
  fetchImpl?: typeof fetch;
  now?: Date;
}

export class SyncInProgressError extends Error {
  constructor() {
    super("Für dich läuft bereits eine Synchronisierung.");
    this.name = "SyncInProgressError";
  }
}

export class TimingNotConfiguredError extends Error {
  constructor() {
    super("Kein Timing-API-Token hinterlegt.");
    this.name = "TimingNotConfiguredError";
  }
}

export class InvalidSyncRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSyncRangeError";
  }
}

// Lock auf globalThis: Route-Handler und Scheduler (instrumentation) können
// in getrennten Bundles laufen, teilen sich aber den Prozess.
const globalForSync = globalThis as unknown as {
  __timingSyncLocks?: Set<string>;
};
const runningSyncs: Set<string> = globalForSync.__timingSyncLocks ?? new Set();
globalForSync.__timingSyncLocks = runningSyncs;

export function isSyncRunning(userId: string): boolean {
  return runningSyncs.has(userId);
}

/** Rollierendes Fenster [heute − windowDays, heute] in Berlin-Tagen. */
export function getSyncWindow(windowDays: number, now = new Date()): DateRange {
  const to = berlinTodayKey(now);
  return { from: shiftDateKey(to, -Math.max(0, windowDays)), to };
}

export function validateSyncRange(range: DateRange): DateRange {
  if (!isDateKey(range.from) || !isDateKey(range.to)) {
    throw new InvalidSyncRangeError("Ungültiges Datum (erwartet YYYY-MM-DD).");
  }
  if (range.from > range.to) {
    throw new InvalidSyncRangeError("Der Start liegt nach dem Ende.");
  }
  const days =
    (berlinDayStart(range.to).getTime() -
      berlinDayStart(range.from).getTime()) /
    86_400_000;
  if (days > MAX_SYNC_RANGE_DAYS) {
    throw new InvalidSyncRangeError(
      `Der Zeitraum darf höchstens ${MAX_SYNC_RANGE_DAYS} Tage umfassen.`,
    );
  }
  return range;
}

/** Fehlertext ohne Token, gekürzt. */
export function sanitizeSyncError(error: unknown, token?: string): string {
  let message =
    error instanceof Error ? error.message : "Unbekannter Fehler beim Sync";
  if (token) message = message.split(token).join("***");
  return message.slice(0, MAX_ERROR_LENGTH);
}

function toExistingEntry(row: {
  id: string;
  externalId: string | null;
  source: EntrySource;
  date: Date;
  startTime: Date;
  endTime: Date;
  duration: Prisma.Decimal;
  type: ExistingEntry["type"];
  description: string | null;
  title: string | null;
  notes: string | null;
  projectPath: string | null;
  billingStatus: string | null;
}): ExistingEntry {
  return {
    ...row,
    dateKey: dateKeyFromDbDate(row.date),
    duration: Number(row.duration),
  };
}

function toEntryData(entry: SyncEntryData) {
  return {
    date: berlinDayStart(entry.dateKey),
    startTime: entry.startTime,
    endTime: entry.endTime,
    duration: entry.duration,
    type: entry.type,
    description: entry.description,
    title: entry.title,
    notes: entry.notes,
    projectPath: entry.projectPath,
    externalId: entry.externalId,
    billingStatus: entry.billingStatus,
    source: EntrySource.TIMING_SYNC,
    importLogId: null,
  };
}

async function runSync(
  userId: string,
  integration: TimingIntegration,
  token: string,
  options: SyncOptions,
): Promise<SyncStats> {
  const startedAt = Date.now();
  const range = options.range
    ? validateSyncRange(options.range)
    : getSyncWindow(integration.syncWindowDays, options.now);

  // Erst vollständig laden – bricht ein Abschnitt ab, wird nichts geschrieben.
  const client = createTimingClient({ token, fetchImpl: options.fetchImpl });
  const raw = await client.listTimeEntries(range);
  const { entries, stats: filterStats } = filterAndMapEntries(
    raw,
    integration.projectRoots,
  );
  const incomingIds = entries.map((entry) => entry.externalId);

  const plan = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.timeEntry.findMany({
        where: {
          userId,
          OR: [
            {
              source: {
                in: [EntrySource.TIMING_SYNC, EntrySource.FILE_IMPORT],
              },
              date: {
                gte: berlinDayStart(range.from),
                lte: berlinDayStart(range.to),
              },
            },
            ...(incomingIds.length > 0
              ? [{ externalId: { in: incomingIds } }]
              : []),
          ],
        },
        select: {
          id: true,
          externalId: true,
          source: true,
          date: true,
          startTime: true,
          endTime: true,
          duration: true,
          type: true,
          description: true,
          title: true,
          notes: true,
          projectPath: true,
          billingStatus: true,
          absenceId: true,
        },
      });

      const result = planSync(
        rows.map(({ absenceId: _absenceId, ...row }) => toExistingEntry(row)),
        entries,
        range,
      );

      // In Timing gelöschte Tage einer Timewarp-Abwesenheit: als unterdrückt
      // vermerken, sonst legt der Kalender-Abgleich sie neu an
      const deletedIds = new Set(result.delete);
      await suppressAbsenceDays(
        tx,
        userId,
        rows.filter((row) => deletedIds.has(row.id) && row.absenceId),
      );

      const idsToDelete = [...result.delete, ...result.replaceFileImports];
      if (idsToDelete.length > 0) {
        await tx.timeEntry.deleteMany({
          where: { userId, id: { in: idsToDelete } },
        });
      }
      for (const { id, data } of result.update) {
        await tx.timeEntry.update({ where: { id }, data: toEntryData(data) });
      }
      if (result.create.length > 0) {
        await tx.timeEntry.createMany({
          data: result.create.map((entry) => ({
            userId,
            ...toEntryData(entry),
          })),
        });
      }
      return result;
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
  );

  return {
    from: range.from,
    to: range.to,
    trigger: options.trigger,
    fetched: filterStats.fetched,
    kept: filterStats.kept,
    skipped: filterStats.skipped,
    created: plan.create.length,
    updated: plan.update.length,
    unchanged: plan.unchanged,
    deleted: plan.delete.length,
    replacedFileImports: plan.replaceFileImports.length,
    conflicts: plan.conflicts.length,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Synchronisiert die Timing-Einträge eines Users. Pro User läuft höchstens
 * ein Sync gleichzeitig (Button und Scheduler).
 */
export async function syncTimingForUser(
  userId: string,
  options: SyncOptions,
): Promise<SyncStats> {
  if (runningSyncs.has(userId)) throw new SyncInProgressError();
  runningSyncs.add(userId);

  let token: string | undefined;
  try {
    const integration = await prisma.timingIntegration.findUnique({
      where: { userId },
    });
    if (!integration?.apiTokenEnc) throw new TimingNotConfiguredError();

    try {
      token = decryptSecret(integration.apiTokenEnc);
      const stats = await runSync(userId, integration, token, options);

      overtimeService.invalidateCache(userId);
      await prisma.timingIntegration.update({
        where: { userId },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: SYNC_STATUS_SUCCESS,
          lastSyncError: null,
          lastSyncStats: stats as unknown as Prisma.InputJsonValue,
        },
      });
      return stats;
    } catch (error) {
      if (error instanceof InvalidSyncRangeError) throw error;
      // lastSyncAt auch bei Fehlern setzen, sonst versucht der Scheduler es
      // bei jedem Tick erneut (z. B. mit ungültigem Token).
      await prisma.timingIntegration
        .update({
          where: { userId },
          data: {
            lastSyncAt: new Date(),
            lastSyncStatus: SYNC_STATUS_FAILED,
            lastSyncError: sanitizeSyncError(error, token),
          },
        })
        .catch(() => undefined);
      throw error;
    }
  } finally {
    runningSyncs.delete(userId);
  }
}
