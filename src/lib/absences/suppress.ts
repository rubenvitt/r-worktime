// „Von Hand gelöscht → nicht neu anlegen“: Wird ein Tag einer Timewarp-
// Abwesenheit von Hand gelöscht oder bearbeitet (in R-Worktime oder – über
// den Timing-Sync erkennbar – in Timing), merkt sich die Abwesenheit den Tag
// in `suppressedDates`. Der Abgleich legt dort nichts mehr an und verknüpft
// dort nichts mehr. Die Liste bleibt, solange die Abwesenheit besteht.

import { AbsenceSource, type Prisma } from "@prisma/client";
import { dateKeyFromDbDate } from "@/lib/dates";

/** Vereinigt vorhandene und neue Tage, sortiert und ohne Duplikate. */
export function mergeSuppressedDates(
  existing: readonly string[],
  added: readonly string[],
): string[] {
  return Array.from(new Set([...existing, ...added])).sort();
}

export interface SuppressibleEntry {
  absenceId: string | null;
  /** @db.Date-Wert (UTC-Mitternacht) */
  date: Date;
}

/**
 * Vermerkt die Tage der Einträge an ihren Timewarp-Abwesenheiten. Einträge
 * ohne Abwesenheit oder mit manueller Abwesenheit werden ignoriert.
 * Gibt die Zahl der neu unterdrückten Tage zurück.
 */
export async function suppressAbsenceDays(
  db: Pick<Prisma.TransactionClient, "absence">,
  userId: string,
  entries: readonly SuppressibleEntry[],
): Promise<number> {
  const datesByAbsence = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.absenceId) continue;
    const list = datesByAbsence.get(entry.absenceId) ?? [];
    list.push(dateKeyFromDbDate(entry.date));
    datesByAbsence.set(entry.absenceId, list);
  }
  if (datesByAbsence.size === 0) return 0;

  const absences = await db.absence.findMany({
    where: {
      userId,
      id: { in: Array.from(datesByAbsence.keys()) },
      source: AbsenceSource.TIMEWARP,
    },
    select: { id: true, suppressedDates: true },
  });

  let added = 0;
  for (const absence of absences) {
    const merged = mergeSuppressedDates(
      absence.suppressedDates,
      datesByAbsence.get(absence.id) ?? [],
    );
    if (merged.length === absence.suppressedDates.length) continue;
    added += merged.length - absence.suppressedDates.length;
    await db.absence.update({
      where: { id: absence.id },
      data: { suppressedDates: merged },
    });
  }
  return added;
}
