// Trägt importierte Feiertage in Timing ein, sobald der Tag begonnen hat
// (Timing nimmt keine Einträge in der Zukunft an). Läuft im Timing-Sync vor
// dem Abruf, damit der Sync die neuen Einträge schon als verknüpft sieht.

import { EntrySource, type TimingIntegration } from "@prisma/client";
import { berlinDayStart, berlinTodayKey, dateKeyFromDbDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { TimingApiError, type TimingClient } from "@/lib/timing/client";
import {
  HOLIDAY_TIMING_NOTE,
  type PendingHoliday,
  planHolidayPush,
  startedHolidays,
} from "@/lib/timing/holidays";

export interface HolidayPushStats {
  pending: number;
  created: number;
  adopted: number;
  failed: number;
  /** Erster Fehler, ohne Token */
  error?: string;
}

function errorText(error: unknown): string {
  return error instanceof TimingApiError
    ? error.message
    : "Timing-API nicht erreichbar.";
}

/**
 * Nur Feiertage ab `holidaysSince` (Tag des Einschaltens) und nur Einträge
 * ohne Timing-ID. Gibt null zurück, wenn die Funktion aus ist.
 */
export async function pushHolidaysToTiming(
  userId: string,
  integration: Pick<
    TimingIntegration,
    "writeHolidays" | "holidayProjectId" | "holidaysSince"
  >,
  client: TimingClient,
  now: Date = new Date(),
): Promise<HolidayPushStats | null> {
  if (!integration.writeHolidays || !integration.holidayProjectId) return null;

  const today = berlinTodayKey(now);
  const since = integration.holidaysSince
    ? dateKeyFromDbDate(integration.holidaysSince)
    : today;
  const stats: HolidayPushStats = {
    pending: 0,
    created: 0,
    adopted: 0,
    failed: 0,
  };
  if (since > today) return stats;

  const rows = await prisma.timeEntry.findMany({
    where: {
      userId,
      type: "HOLIDAY",
      source: EntrySource.HOLIDAY,
      externalId: null,
      date: { gte: berlinDayStart(since), lte: berlinDayStart(today) },
    },
    select: { id: true, date: true, duration: true, description: true },
    orderBy: { date: "asc" },
  });
  const pending = startedHolidays(
    rows.map(
      (row): PendingHoliday => ({
        id: row.id,
        dateKey: dateKeyFromDbDate(row.date),
        duration: Number(row.duration),
        title: row.description?.trim() || "Feiertag",
      }),
    ),
    now,
  );
  stats.pending = pending.length;
  if (pending.length === 0) return stats;

  const projectRef = integration.holidayProjectId;
  let plan: ReturnType<typeof planHolidayPush>;
  try {
    const found = await client.listTimeEntries(
      { from: pending[0].dateKey, to: pending[pending.length - 1].dateKey },
      { projects: [projectRef] },
    );
    const selves = found.map((entry) => entry.self);
    const used =
      selves.length > 0
        ? await prisma.timeEntry.findMany({
            where: { userId, externalId: { in: selves } },
            select: { externalId: true },
          })
        : [];
    plan = planHolidayPush(
      pending,
      found,
      new Set(used.map((row) => row.externalId ?? "")),
    );
  } catch (error) {
    stats.failed = pending.length;
    stats.error = `Suche in Timing fehlgeschlagen: ${errorText(error)}`;
    return stats;
  }

  // Nur setzen, wenn der Eintrag noch keine ID hat (paralleler Lauf o. Ä.)
  const link = (id: string, self: string) =>
    prisma.timeEntry.updateMany({
      where: { id, userId, externalId: null },
      data: { externalId: self },
    });

  for (const adopt of plan.adopt) {
    try {
      await link(adopt.id, adopt.self);
      stats.adopted++;
    } catch {
      stats.failed++;
      stats.error ??= `Feiertag ${adopt.dateKey} nicht verknüpft.`;
    }
  }
  for (const create of plan.create) {
    try {
      const entry = await client.createTimeEntry({
        start: create.start,
        end: create.end,
        projectRef,
        title: create.title,
        notes: HOLIDAY_TIMING_NOTE,
        billingStatus: "not_billable",
      });
      // Scheitert das, findet der nächste Lauf den Eintrag und übernimmt ihn
      await link(create.id, entry.self);
      stats.created++;
    } catch (error) {
      stats.failed++;
      stats.error ??= `Feiertag ${create.dateKey}: ${errorText(error)}`;
    }
  }
  return stats;
}
