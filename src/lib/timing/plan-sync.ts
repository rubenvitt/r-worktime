import type { EntrySource, EntryType } from "@prisma/client";
import type { DateRange } from "./client";
import type { SyncEntryData } from "./mapping";

// Reine Diff-Logik des Timing-Syncs – ohne DB, damit sie testbar bleibt.

/** Bestehender Eintrag, so weit der Sync ihn kennen muss. */
export interface ExistingEntry {
  id: string;
  externalId: string | null;
  source: EntrySource;
  dateKey: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  type: EntryType;
  description: string | null;
  title: string | null;
  notes: string | null;
  projectPath: string | null;
  billingStatus: string | null;
}

export interface SyncPlan {
  create: SyncEntryData[];
  update: Array<{ id: string; data: SyncEntryData }>;
  unchanged: number;
  /** TIMING_SYNC-Einträge im Fenster, die Timing nicht mehr liefert */
  delete: string[];
  /** FILE_IMPORT-Einträge an Tagen, die der Sync übernimmt */
  replaceFileImports: string[];
  /** Eingehende IDs, die schon an einem geschützten Eintrag hängen */
  conflicts: string[];
}

const SYNC_OWNED: ReadonlySet<EntrySource> = new Set<EntrySource>([
  "TIMING_SYNC",
  "FILE_IMPORT",
]);

function inWindow(dateKey: string, window: DateRange): boolean {
  return dateKey >= window.from && dateKey <= window.to;
}

function hasChanged(existing: ExistingEntry, next: SyncEntryData): boolean {
  return (
    existing.source !== "TIMING_SYNC" ||
    existing.dateKey !== next.dateKey ||
    existing.startTime.getTime() !== next.startTime.getTime() ||
    existing.endTime.getTime() !== next.endTime.getTime() ||
    existing.duration !== next.duration ||
    existing.type !== next.type ||
    existing.description !== next.description ||
    existing.title !== next.title ||
    existing.notes !== next.notes ||
    existing.projectPath !== next.projectPath ||
    existing.billingStatus !== next.billingStatus
  );
}

/**
 * Plant den Abgleich.
 * `existing` muss enthalten: TIMING_SYNC- und FILE_IMPORT-Einträge im Fenster
 * sowie alle Einträge (jeder Quelle), deren externalId in `incoming` vorkommt.
 */
export function planSync(
  existing: ExistingEntry[],
  incoming: SyncEntryData[],
  window: DateRange,
): SyncPlan {
  const plan: SyncPlan = {
    create: [],
    update: [],
    unchanged: 0,
    delete: [],
    replaceFileImports: [],
    conflicts: [],
  };

  // Doppelte IDs: der letzte gewinnt
  const incomingById = new Map<string, SyncEntryData>();
  for (const entry of incoming) incomingById.set(entry.externalId, entry);

  const existingById = new Map<string, ExistingEntry>();
  for (const entry of existing) {
    if (entry.externalId) existingById.set(entry.externalId, entry);
  }

  const touchedIds = new Set<string>();
  const syncedDates = new Set<string>();

  for (const [externalId, data] of incomingById) {
    const match = existingById.get(externalId);
    if (!match) {
      plan.create.push(data);
    } else if (!SYNC_OWNED.has(match.source)) {
      // Manuelle Einträge, Feiertage, Bulk-Fill, Saldo nie anfassen
      plan.conflicts.push(externalId);
      continue;
    } else {
      touchedIds.add(match.id);
      if (hasChanged(match, data)) {
        plan.update.push({ id: match.id, data });
      } else {
        plan.unchanged++;
      }
    }
    if (inWindow(data.dateKey, window)) syncedDates.add(data.dateKey);
  }

  for (const entry of existing) {
    if (touchedIds.has(entry.id) || !inWindow(entry.dateKey, window)) continue;

    if (entry.source === "TIMING_SYNC") {
      if (!entry.externalId || !incomingById.has(entry.externalId)) {
        plan.delete.push(entry.id);
      }
    } else if (
      entry.source === "FILE_IMPORT" &&
      syncedDates.has(entry.dateKey)
    ) {
      plan.replaceFileImports.push(entry.id);
    }
  }

  return plan;
}
