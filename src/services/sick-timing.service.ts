// Krank-Einträge nach Timing: manuell angelegte Krankheit (Problemliste,
// „Abwesenheit eintragen“, neuer Eintrag) geht ins gewählte Krank-Projekt.
// Sofort nach dem Anlegen, sonst im nächsten Timing-Sync – etwa für Tage, die
// noch nicht begonnen haben (Timing nimmt keine Einträge in der Zukunft an).
// Nur serverseitig.

import {
  EntrySource,
  EntryType,
  Prisma,
  type TimingIntegration,
} from "@prisma/client";
import { berlinDateKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  TimingApiError,
  type TimingApiTimeEntry,
  type TimingClient,
} from "@/lib/timing/client";
import { mapApiEntry, toSyncEntryRow } from "@/lib/timing/mapping";
import {
  type PendingSickEntry,
  planSickPush,
  SICK_FILL_TITLE,
  SICK_TIMING_NOTE,
  startedSickEntries,
} from "@/lib/timing/sick";
import { timingClientForUser } from "@/services/timing-entries.service";

export interface SickPushStats {
  /** Begonnene Krank-Einträge ohne Timing-ID */
  pending: number;
  created: number;
  adopted: number;
  failed: number;
  /** Erster Fehler, ohne Token */
  error?: string;
}

type SickIntegration = Pick<
  TimingIntegration,
  "sickProjectId" | "sickSince" | "projectRoots"
>;

function errorText(error: unknown): string {
  return error instanceof TimingApiError
    ? error.message
    : "Timing-API nicht erreichbar.";
}

// Je Nutzer nur ein Lauf gleichzeitig (Sync und Anlegen): sonst legen zwei
// Läufe denselben Eintrag doppelt in Timing an. Der übersprungene Lauf holt
// nichts nach – das macht der nächste Sync.
const running = new Set<string>();

/**
 * Nach einem Fehler beim Verknüpfen: Den Eintrag in Timing nur löschen, wenn
 * der lokale sicher noch unverknüpft ist – unverknüpft holte ihn der nächste
 * Sync als zweiten Krank-Eintrag. Kam das Update doch an (Fehler erst nach
 * dem Commit) oder lässt sich das nicht prüfen, bleibt er stehen: Sonst
 * löschte der nächste Sync den verknüpften lokalen Eintrag mit.
 */
async function rollBackUnlinked(
  userId: string,
  entryId: string,
  self: string,
  client: TimingClient,
): Promise<void> {
  try {
    const current = await prisma.timeEntry.findFirst({
      where: { id: entryId, userId },
      select: { externalId: true },
    });
    if (current && current.externalId !== null) return;
    await client.deleteTimeEntry(self);
  } catch (cleanupError) {
    console.error(
      `[timing] Krank-Eintrag ${self} nicht zurückgenommen:`,
      errorText(cleanupError),
    );
  }
}

/**
 * Hängt den Timing-Eintrag an den lokalen. Liegt das Krank-Projekt unter den
 * Projekt-Wurzeln und erkennt der Sync es als Krankheit, gehört der Eintrag
 * danach dem Timing-Sync – Änderungen in Timing kommen dann zurück. Sonst
 * bleibt er manuell und nur die ID hängt dran. createdInTiming übersteht
 * Bearbeiten: Löschen in R-Worktime löscht den Eintrag dann auch in Timing.
 * `ownsRemote`: der Timing-Eintrag ist eben erst angelegt (darf bei Fehlern
 * zurückgenommen werden).
 */
async function linkSickEntry(
  userId: string,
  entryId: string,
  remote: TimingApiTimeEntry,
  projectRoots: string[],
  client: TimingClient,
  ownsRemote: boolean,
): Promise<void> {
  const mapped = mapApiEntry(remote, projectRoots);
  const data =
    mapped.kept && mapped.entry.type === EntryType.SICK
      ? { ...toSyncEntryRow(mapped.entry), createdInTiming: true }
      : { externalId: remote.self, createdInTiming: true };
  try {
    // Nur, wenn der Eintrag noch keine Timing-ID hat
    const { count } = await prisma.timeEntry.updateMany({
      where: { id: entryId, userId, externalId: null },
      data,
    });
    if (count === 0 && ownsRemote) {
      // Gelöscht oder schon verknüpft: der neue Timing-Eintrag ist überzählig
      await rollBackUnlinked(userId, entryId, remote.self, client);
    }
  } catch (error) {
    // Ein paralleler Timing-Sync hat den neuen Eintrag schon abgerufen: der
    // abgerufene vertritt ihn, der lokale fällt weg
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      await prisma.timeEntry.deleteMany({ where: { id: entryId, userId } });
      return;
    }
    if (ownsRemote) {
      await rollBackUnlinked(userId, entryId, remote.self, client);
    }
    throw error;
  }
}

/** Legt den Eintrag in Timing an und verknüpft ihn. */
export async function createSickEntryInTiming(
  userId: string,
  entry: PendingSickEntry,
  integration: { sickProjectId: string; projectRoots: string[] },
  client: TimingClient,
): Promise<void> {
  const created = await client.createTimeEntry({
    start: entry.startTime,
    end: entry.endTime,
    projectRef: integration.sickProjectId,
    title: entry.title,
    notes: entry.notes ?? SICK_TIMING_NOTE,
    billingStatus: "not_billable",
  });
  await linkSickEntry(
    userId,
    entry.id,
    created,
    integration.projectRoots,
    client,
    true,
  );
}

/**
 * Trägt alle begonnenen, manuell angelegten Krank-Einträge ohne Timing-ID in
 * Timing ein, die seit dem Wählen des Krank-Projekts angelegt wurden. Gibt
 * null zurück, wenn kein Krank-Projekt gewählt ist.
 */
export async function pushPendingSickEntries(
  userId: string,
  integration: SickIntegration,
  client: TimingClient,
  now: Date = new Date(),
): Promise<SickPushStats | null> {
  const { sickProjectId, sickSince } = integration;
  if (!sickProjectId || !sickSince) return null;
  const stats: SickPushStats = {
    pending: 0,
    created: 0,
    adopted: 0,
    failed: 0,
  };
  if (running.has(userId)) {
    return { ...stats, error: "Übertragung läuft gerade schon." };
  }
  running.add(userId);
  try {
    const rows = await prisma.timeEntry.findMany({
      where: {
        userId,
        type: EntryType.SICK,
        source: EntrySource.MANUAL,
        externalId: null,
        createdAt: { gte: sickSince },
        startTime: { lte: now },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        title: true,
        notes: true,
        description: true,
      },
      orderBy: { startTime: "asc" },
    });
    const pending = startedSickEntries(
      rows.map(
        (row): PendingSickEntry => ({
          id: row.id,
          startTime: row.startTime,
          endTime: row.endTime,
          title:
            row.title?.trim() || row.description?.trim() || SICK_FILL_TITLE,
          notes: row.notes?.trim() || null,
        }),
      ),
      now,
    );
    stats.pending = pending.length;
    if (pending.length === 0) return stats;

    let plan: ReturnType<typeof planSickPush>;
    let inTiming: TimingApiTimeEntry[];
    try {
      inTiming = await client.listTimeEntries(
        {
          from: berlinDateKey(pending[0].startTime),
          to: berlinDateKey(pending[pending.length - 1].startTime),
        },
        { projects: [sickProjectId] },
      );
      const selves = inTiming.map((entry) => entry.self);
      const used =
        selves.length > 0
          ? await prisma.timeEntry.findMany({
              where: { userId, externalId: { in: selves } },
              select: { externalId: true },
            })
          : [];
      plan = planSickPush(
        pending,
        inTiming,
        new Set(used.map((row) => row.externalId ?? "")),
      );
    } catch (error) {
      stats.failed = pending.length;
      stats.error = `Suche in Timing fehlgeschlagen: ${errorText(error)}`;
      return stats;
    }

    const bySelf = new Map(inTiming.map((entry) => [entry.self, entry]));
    for (const adopt of plan.adopt) {
      const remote = bySelf.get(adopt.self);
      try {
        if (!remote) throw new Error("Timing-Eintrag verschwunden");
        await linkSickEntry(
          userId,
          adopt.id,
          remote,
          integration.projectRoots,
          client,
          false,
        );
        stats.adopted++;
      } catch {
        stats.failed++;
        stats.error ??= "Krank-Eintrag nicht verknüpft.";
      }
    }
    for (const create of plan.create) {
      try {
        await createSickEntryInTiming(
          userId,
          create,
          { sickProjectId, projectRoots: integration.projectRoots },
          client,
        );
        stats.created++;
      } catch (error) {
        stats.failed++;
        stats.error ??= `Krank ${berlinDateKey(create.startTime)}: ${errorText(error)}`;
      }
    }
    return stats;
  } finally {
    running.delete(userId);
  }
}

/**
 * Direkt nach dem Anlegen: offene Krank-Einträge gleich nach Timing. Best
 * effort – Fehler werden geloggt, nie geworfen; der nächste Sync versucht es
 * erneut.
 */
export async function pushPendingSickEntriesNow(
  userId: string,
  now: Date = new Date(),
): Promise<SickPushStats | null> {
  try {
    const integration = await prisma.timingIntegration.findUnique({
      where: { userId },
      select: {
        apiTokenEnc: true,
        sickProjectId: true,
        sickSince: true,
        projectRoots: true,
      },
    });
    if (!integration?.apiTokenEnc || !integration.sickProjectId) return null;
    const timing = await timingClientForUser(userId);
    if (!timing.client) {
      return {
        pending: 0,
        created: 0,
        adopted: 0,
        failed: 0,
        error: timing.problem,
      };
    }
    const stats = await pushPendingSickEntries(
      userId,
      integration,
      timing.client,
      now,
    );
    if (stats?.error) console.warn(`[timing] Krank: ${stats.error}`);
    return stats;
  } catch (error) {
    console.error(
      "[timing] Krank-Einträge nicht nach Timing übertragen:",
      error instanceof Error ? error.name : "unbekannt",
    );
    return null;
  }
}
