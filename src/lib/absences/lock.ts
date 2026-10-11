// Sperre je Nutzer für alles, was Abwesenheiten anlegt oder löscht: Dialog
// „Abwesenheit eintragen“, DELETE /api/absences/[id] und der Timewarp-Abgleich.
// So legen Doppelklick, zwei Tabs oder Dialog und Abgleich keine Tage doppelt an.

import type { Prisma } from "@prisma/client";

/** Schlüssel der Advisory-Lock; nicht ändern, sonst sperren alte und neue Stände getrennt. */
export function absenceLockKey(userId: string): string {
  return `absences:${userId}`;
}

/**
 * Nimmt die Advisory-Lock des Nutzers für die laufende Transaktion
 * (pg_advisory_xact_lock, endet mit Commit/Rollback). Muss als erstes in
 * `prisma.$transaction(async (tx) => …)` aufgerufen werden.
 */
export async function withUserAbsenceLock(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  userId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${absenceLockKey(userId)}))) AS locked`;
}
