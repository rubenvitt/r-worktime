// „Krank“ aus der Problemliste: füllt einen Arbeitstag mit einem Krank-Eintrag
// auf das Tagessoll auf und trägt ihn, wenn ein Krank-Projekt gewählt ist,
// gleich in Timing ein. Nur serverseitig.

import { EntrySource, EntryType, Prisma } from "@prisma/client";
import { withUserAbsenceLock } from "@/lib/absences/lock";
import { berlinDayStart, weekdayOfKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { dailyTargetHours } from "@/lib/reports/absences";
import { TimingApiError } from "@/lib/timing/client";
import { mapApiEntry, toSyncEntryRow } from "@/lib/timing/mapping";
import {
  planSickFill,
  SICK_FILL_TITLE,
  SICK_TIMING_NOTE,
  type SickFillPlan,
} from "@/lib/timing/sick";
import { loadOfficialHolidays } from "@/services/holiday.service";
import { overtimeService } from "@/services/overtime.service";
import { getUserSettings } from "@/services/settings.service";
import { timingClientForUser } from "@/services/timing-entries.service";

export type SickTimingResult =
  /** In Timing angelegt und verknüpft */
  | { status: "synced" }
  /** Kein Krank-Projekt gewählt oder kein Token: nur lokal */
  | { status: "local" }
  /** Timing nimmt keine Einträge an, die noch nicht begonnen haben */
  | { status: "future" }
  | { status: "failed"; error: string };

export type SickFillResult =
  | { created: true; dateKey: string; hours: number; timing: SickTimingResult }
  /** Kein Soll (Wochenende, freier Tag, Feiertag) oder Soll schon erreicht */
  | { created: false; dateKey: string; reason: "noTarget" | "full" };

function errorText(error: unknown): string {
  return error instanceof TimingApiError
    ? error.message
    : "Timing-API nicht erreichbar.";
}

/** Legt den lokalen Eintrag an; serialisiert je Nutzer gegen Doppelklicks. */
async function createLocalSickEntry(
  userId: string,
  dateKey: string,
  workDays: readonly number[],
  dailyHours: number,
): Promise<
  { id: string; plan: SickFillPlan } | { id: null; reason: "noTarget" | "full" }
> {
  if (!workDays.includes(weekdayOfKey(dateKey))) {
    return { id: null, reason: "noTarget" };
  }
  const official = await loadOfficialHolidays([Number(dateKey.slice(0, 4))]);
  if (official.names[dateKey] !== undefined) {
    return { id: null, reason: "noTarget" };
  }

  return prisma.$transaction(async (tx) => {
    await withUserAbsenceLock(tx, userId);
    const dayEntries = await tx.timeEntry.findMany({
      where: { userId, date: berlinDayStart(dateKey) },
      select: { startTime: true, endTime: true, duration: true, type: true },
    });
    if (dayEntries.some((entry) => entry.type === EntryType.HOLIDAY)) {
      return { id: null, reason: "noTarget" as const };
    }
    const plan = planSickFill(
      dateKey,
      dayEntries.map((entry) => ({
        startTime: entry.startTime,
        endTime: entry.endTime,
        duration: Number(entry.duration),
      })),
      dailyHours,
    );
    if (!plan) return { id: null, reason: "full" as const };

    const created = await tx.timeEntry.create({
      data: {
        userId,
        date: berlinDayStart(dateKey),
        startTime: plan.startTime,
        endTime: plan.endTime,
        duration: plan.hours,
        type: EntryType.SICK,
        title: SICK_FILL_TITLE,
        description: SICK_FILL_TITLE,
        source: EntrySource.MANUAL,
      },
      select: { id: true },
    });
    return { id: created.id, plan };
  });
}

/**
 * Trägt den Eintrag in Timing ein und verknüpft ihn. Liegt das Krank-Projekt
 * unter den Projekt-Wurzeln und erkennt der Sync es als Krankheit, gehört der
 * Eintrag danach dem Timing-Sync (wie ein abgerufener Eintrag) – Änderungen in
 * Timing kommen dann zurück. Sonst bleibt er manuell und nur die ID hängt dran.
 */
async function pushSickEntry(
  userId: string,
  entryId: string,
  plan: SickFillPlan,
  now: Date,
): Promise<SickTimingResult> {
  const integration = await prisma.timingIntegration.findUnique({
    where: { userId },
    select: { apiTokenEnc: true, sickProjectId: true, projectRoots: true },
  });
  if (!integration?.apiTokenEnc || !integration.sickProjectId) {
    return { status: "local" };
  }
  if (plan.startTime.getTime() > now.getTime()) return { status: "future" };

  const timing = await timingClientForUser(userId);
  if (!timing.client) return { status: "failed", error: timing.problem };

  let created: Awaited<ReturnType<typeof timing.client.createTimeEntry>>;
  try {
    created = await timing.client.createTimeEntry({
      start: plan.startTime,
      end: plan.endTime,
      projectRef: integration.sickProjectId,
      title: SICK_FILL_TITLE,
      notes: SICK_TIMING_NOTE,
      billingStatus: "not_billable",
    });
  } catch (error) {
    return { status: "failed", error: errorText(error) };
  }

  const mapped = mapApiEntry(created, integration.projectRoots);
  const data =
    mapped.kept && mapped.entry.type === EntryType.SICK
      ? toSyncEntryRow(mapped.entry)
      : // Die Notiz markiert den Eintrag als von R-Worktime in Timing angelegt
        // (siehe isOwnSickTimingEntry): nur dann löscht das Löschen ihn dort mit
        { externalId: created.self, notes: SICK_TIMING_NOTE };
  try {
    await prisma.timeEntry.update({ where: { id: entryId }, data });
  } catch (error) {
    // Ein paralleler Timing-Sync hat den neuen Eintrag schon abgerufen: der
    // abgerufene vertritt ihn, der lokale fällt weg
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      await prisma.timeEntry.deleteMany({ where: { id: entryId, userId } });
      return { status: "synced" };
    }
    // Sonst den Eintrag in Timing wieder löschen: unverknüpft holte ihn der
    // nächste Sync als zweiten Krank-Eintrag desselben Tags
    try {
      await timing.client.deleteTimeEntry(created.self);
    } catch (cleanupError) {
      console.error(
        `[timing] Krank-Eintrag ${created.self} nicht zurückgenommen:`,
        errorText(cleanupError),
      );
    }
    throw error;
  }
  return { status: "synced" };
}

/** Füllt einen Tag ("YYYY-MM-DD") mit „Krank“ auf das Tagessoll auf. */
export async function fillSickDay(
  userId: string,
  dateKey: string,
  now: Date = new Date(),
): Promise<SickFillResult> {
  const settings = await getUserSettings(userId);
  const dailyHours = dailyTargetHours(
    Number(settings.weeklyWorkHours),
    settings.workDays,
  );

  const local = await createLocalSickEntry(
    userId,
    dateKey,
    settings.workDays,
    dailyHours,
  );
  if (local.id === null) {
    return { created: false, dateKey, reason: local.reason };
  }
  overtimeService.invalidateCache(userId);

  let timing: SickTimingResult;
  try {
    timing = await pushSickEntry(userId, local.id, local.plan, now);
  } catch (error) {
    // Der lokale Eintrag gilt trotzdem
    console.error(
      `[timing] Krank-Eintrag ${dateKey} nicht verknüpft:`,
      error instanceof Error ? error.name : "unbekannt",
    );
    timing = { status: "failed", error: "Verknüpfen fehlgeschlagen." };
  }
  return { created: true, dateKey, hours: local.plan.hours, timing };
}
