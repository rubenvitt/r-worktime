// Timing-Client für einen Nutzer und das Löschen eigener Timing-Einträge
// (vom Kalender-Abgleich angelegt, source TIMEWARP) nach einer Löschung in
// R-Worktime. Nur serverseitig.

import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import {
  createTimingClient,
  isTimeEntryRef,
  type TimingClient,
} from "@/lib/timing/client";

export type UserTimingClient =
  | { client: TimingClient; problem: null }
  | { client: null; problem: string };

/** Timing-Client mit dem hinterlegten Token, sonst der Grund auf Deutsch. */
export async function timingClientForUser(
  userId: string,
  options: { timeoutMs?: number } = {},
): Promise<UserTimingClient> {
  const timing = await prisma.timingIntegration.findUnique({
    where: { userId },
    select: { apiTokenEnc: true },
  });
  if (!timing?.apiTokenEnc) {
    return { client: null, problem: "Kein Timing-Token hinterlegt." };
  }
  try {
    return {
      client: createTimingClient({
        token: decryptSecret(timing.apiTokenEnc),
        timeoutMs: options.timeoutMs ?? 15_000,
      }),
      problem: null,
    };
  } catch {
    return {
      client: null,
      problem: "Timing-Token nicht lesbar, bitte neu hinterlegen.",
    };
  }
}

/**
 * Löscht eigene Einträge in Timing, nachdem sie lokal gelöscht wurden.
 * Best effort: Fehler werden geloggt, nie geworfen – die lokale Löschung
 * (und der unterdrückte Tag) gilt trotzdem. Gibt die Zahl der in Timing
 * gelöschten Einträge zurück.
 */
export async function deleteOwnTimingEntries(
  userId: string,
  externalIds: readonly (string | null | undefined)[],
): Promise<number> {
  const refs = Array.from(new Set(externalIds.filter(isTimeEntryRef)));
  if (refs.length === 0) return 0;

  let deleted = 0;
  try {
    const timing = await timingClientForUser(userId);
    if (!timing.client) {
      console.warn(
        `[timing] ${refs.length} Eintrag/Einträge nicht in Timing gelöscht: ${timing.problem}`,
      );
      return 0;
    }
    for (const ref of refs) {
      try {
        await timing.client.deleteTimeEntry(ref);
        deleted++;
      } catch (error) {
        console.error(
          `[timing] Eintrag ${ref} nicht in Timing gelöscht:`,
          error instanceof Error && error.name === "TimingApiError"
            ? error.message
            : "Timing-API nicht erreichbar.",
        );
      }
    }
  } catch (error) {
    console.error(
      "[timing] Löschen in Timing fehlgeschlagen:",
      error instanceof Error ? error.name : "unbekannt",
    );
  }
  return deleted;
}
