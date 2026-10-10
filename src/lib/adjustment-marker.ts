// Prisma-freie Bausteine zum Anfangs-Überstunden-Saldo – auch im Client nutzbar.
// Die Datenbank-Helfer (findAdjustmentEntry, excludeAdjustmentFilter) liegen in
// src/lib/adjustment.ts.

/** Alter Text-Marker des Anfangs-Überstunden-Saldos (Fallback für Altdaten). */
export const ADJUSTMENT_MARKER = "Anfangs-Überstunden-Saldo";

/** Saldo-Eintrag: über source, für Altdaten zusätzlich über den Text-Marker. */
export function isAdjustmentEntry(entry: {
  source: string;
  description?: string | null;
}): boolean {
  return (
    entry.source === "ADJUSTMENT" ||
    (entry.description?.includes(ADJUSTMENT_MARKER) ?? false)
  );
}
