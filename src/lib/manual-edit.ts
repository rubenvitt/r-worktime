import { EntrySource, type EntryType } from "@prisma/client";

// Was beim manuellen Bearbeiten eines Eintrags zusätzlich gesetzt werden muss,
// damit Sync und Datei-Import die Korrektur nicht still überschreiben.

export interface EditableEntrySnapshot {
  source: EntrySource;
  externalId: string | null;
  date: Date;
  startTime: Date;
  endTime: Date;
  duration: { toString(): string } | number;
  type: string;
  description: string | null;
}

export interface ManualEdit {
  date: Date;
  startTime: Date;
  endTime: Date;
  duration: number;
  type: EntryType;
  description: string | null;
}

export interface ManualEditOverrides {
  source?: EntrySource;
  title?: null;
  notes?: null;
}

const minuteOf = (date: Date) => Math.floor(date.getTime() / 60_000);

/**
 * Der Dialog zeigt und sendet Zeiten nur minutengenau und rechnet die Dauer
 * neu. Stimmen Datum, Start und Ende auf die Minute mit dem Bestand überein,
 * gelten die exakten Bestandswerte – sonst wäre schon ein Speichern ohne
 * Änderung eine „Korrektur“ (Sekunden weg, Eintrag wird MANUAL).
 */
export function keepExactTimes(
  existing: EditableEntrySnapshot,
  next: ManualEdit,
): ManualEdit {
  if (
    existing.date.getTime() !== next.date.getTime() ||
    minuteOf(existing.startTime) !== minuteOf(next.startTime) ||
    minuteOf(existing.endTime) !== minuteOf(next.endTime)
  ) {
    return next;
  }
  return {
    ...next,
    startTime: existing.startTime,
    endTime: existing.endTime,
    duration: Number(existing.duration.toString()),
  };
}

export function hasEntryChanged(
  existing: EditableEntrySnapshot,
  next: ManualEdit,
): boolean {
  return (
    existing.date.getTime() !== next.date.getTime() ||
    existing.startTime.getTime() !== next.startTime.getTime() ||
    existing.endTime.getTime() !== next.endTime.getTime() ||
    Math.abs(Number(existing.duration.toString()) - next.duration) >= 0.005 ||
    existing.type !== next.type ||
    (existing.description ?? null) !== (next.description ?? null)
  );
}

/**
 * - Geänderte Sync-/Import-Einträge mit Timing-ID werden MANUAL (externalId
 *   bleibt): Der Sync meldet die ID dann als Konflikt und lässt sie in Ruhe,
 *   ein Datei-Import überspringt sie – kein Überschreiben, kein Duplikat.
 * - Alt-Importe ohne ID bleiben FILE_IMPORT: Ohne ID lassen sie sich nicht
 *   zuordnen, als MANUAL würden sie neben dem nächsten Sync doppelt zählen.
 * - Neue description → title/notes leeren, sonst zeigt der Stundenzettel
 *   (title vor description) weiter den alten Titel.
 */
export function manualEditOverrides(
  existing: EditableEntrySnapshot,
  next: ManualEdit,
): ManualEditOverrides {
  if (!hasEntryChanged(existing, next)) return {};

  const overrides: ManualEditOverrides = {};
  const syncOwned =
    existing.source === EntrySource.TIMING_SYNC ||
    existing.source === EntrySource.FILE_IMPORT;
  if (syncOwned && existing.externalId) {
    overrides.source = EntrySource.MANUAL;
  }
  if ((existing.description ?? null) !== (next.description ?? null)) {
    overrides.title = null;
    overrides.notes = null;
  }
  return overrides;
}
