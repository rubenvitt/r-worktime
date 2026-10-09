import { EntrySource } from "@prisma/client";
import { ADJUSTMENT_MARKER } from "@/lib/adjustment";

// Hilfen für den Restore alter und neuer Backups (reine Funktionen, testbar).

export interface RestoreEntryInput {
  type: string;
  description?: string | null;
  source?: EntrySource | string | null;
}

/**
 * Quelle eines Backup-Eintrags. Backups vor der Timing-Migration kennen
 * `source` nicht – dann gelten dieselben Regeln wie in der Migration:
 * Saldo-Marker → ADJUSTMENT, Feiertag → HOLIDAY, sonst MANUAL.
 * Frühere Datei-Importe lassen sich aus Alt-Backups nicht erkennen.
 */
export function resolveRestoreSource(entry: RestoreEntryInput): EntrySource {
  if (
    entry.source &&
    (Object.values(EntrySource) as string[]).includes(entry.source)
  ) {
    return entry.source as EntrySource;
  }
  if (entry.description?.includes(ADJUSTMENT_MARKER)) {
    return EntrySource.ADJUSTMENT;
  }
  if (entry.type === "HOLIDAY") return EntrySource.HOLIDAY;
  return EntrySource.MANUAL;
}

/** Felder, die erst neuere Backups enthalten. */
export const SYNC_FIELDS = [
  "source",
  "externalId",
  "title",
  "notes",
  "projectPath",
  "billingStatus",
] as const;

type SyncField = (typeof SYNC_FIELDS)[number];

/**
 * Beim Überschreiben eines vorhandenen Eintrags (Abgleich über Datum und
 * Startzeit): Felder, die das Backup gar nicht liefert, vom vorhandenen
 * Eintrag übernehmen. Sonst würde ein Alt-Backup einen Sync-Eintrag zu
 * MANUAL ohne externalId herabstufen, und der nächste Sync legt ihn doppelt an.
 */
export function keepMissingSyncFields<
  T extends Record<SyncField, unknown>,
  E extends Record<SyncField, unknown>,
>(data: T, backupEntry: object, existing: E): T {
  const merged = { ...data };
  for (const field of SYNC_FIELDS) {
    if (!(field in backupEntry)) {
      (merged as Record<SyncField, unknown>)[field] = existing[field];
    }
  }
  return merged;
}
