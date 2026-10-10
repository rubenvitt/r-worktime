import { EntrySource } from "@prisma/client";
import { ADJUSTMENT_MARKER } from "@/lib/adjustment";
import { isDateKey } from "@/lib/dates";

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

export interface RestoredSettings {
  weeklyWorkHours: number;
  workDays: number[];
  annualVacationDays: number;
}

const DEFAULT_RESTORED_SETTINGS: RestoredSettings = {
  weeklyWorkHours: 40,
  workDays: [1, 2, 3, 4, 5],
  annualVacationDays: 30,
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Einstellungen aus einem Backup. Übernimmt nur Felder, die es noch gibt;
 * entfernte Felder alter Backups (Standardzeiten, Pause, Zeitzone, Sprache,
 * Theme, Benachrichtigung) werden ignoriert. Decimal-Werte kommen aus dem
 * Backup als String ("40") und werden in Zahlen umgewandelt.
 */
export function settingsFromBackup(raw: unknown): RestoredSettings {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const weeklyWorkHours = toFiniteNumber(source.weeklyWorkHours);
  const annualVacationDays = toFiniteNumber(source.annualVacationDays);
  const workDays =
    Array.isArray(source.workDays) &&
    source.workDays.length > 0 &&
    source.workDays.every(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6,
    )
      ? [...new Set(source.workDays as number[])]
      : DEFAULT_RESTORED_SETTINGS.workDays;

  return {
    weeklyWorkHours:
      weeklyWorkHours !== null && weeklyWorkHours > 0
        ? weeklyWorkHours
        : DEFAULT_RESTORED_SETTINGS.weeklyWorkHours,
    workDays,
    annualVacationDays:
      annualVacationDays !== null &&
      annualVacationDays >= 0 &&
      annualVacationDays <= 60
        ? annualVacationDays
        : DEFAULT_RESTORED_SETTINGS.annualVacationDays,
  };
}

export interface RestoredTravelDay {
  /** "YYYY-MM-DD" */
  date: string;
  isTravel: boolean;
}

/**
 * Reisetag-Festlegungen aus `userData` eines Backups. Ältere Backups kennen
 * `travelDays` nicht → null; dann darf ein Restore vorhandene Festlegungen
 * auch beim Ersetzen nicht löschen. Ungültige Zeilen fallen weg, bei
 * Dubletten gilt die letzte. Datum als Key oder ISO-Zeitstempel (@db.Date).
 */
export function travelDaysFromBackup(
  userData: unknown,
): RestoredTravelDay[] | null {
  if (!userData || typeof userData !== "object") return null;
  const raw = (userData as Record<string, unknown>).travelDays;
  if (!Array.isArray(raw)) return null;

  const byDate = new Map<string, boolean>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { date, isTravel } = item as Record<string, unknown>;
    if (typeof date !== "string" || typeof isTravel !== "boolean") continue;
    const key = date.slice(0, 10);
    if (!isDateKey(key)) continue;
    byDate.delete(key);
    byDate.set(key, isTravel);
  }
  return Array.from(byDate.entries())
    .map(([date, isTravel]) => ({ date, isTravel }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
