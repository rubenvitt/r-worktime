// „Krank“ aus der Problemliste: füllt einen Arbeitstag mit einem Krank-Eintrag
// auf das Tagessoll auf und trägt ihn, wenn ein Krank-Projekt gewählt ist,
// gleich in Timing ein. Nur serverseitig.

import { EntrySource, EntryType } from "@prisma/client";
import { withUserAbsenceLock } from "@/lib/absences/lock";
import { berlinDayStart, weekdayOfKey } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { dailyTargetHours } from "@/lib/reports/absences";
import {
  planSickFill,
  SICK_FILL_TITLE,
  type SickFillPlan,
} from "@/lib/timing/sick";
import { loadOfficialHolidays } from "@/services/holiday.service";
import { overtimeService } from "@/services/overtime.service";
import { getUserSettings } from "@/services/settings.service";
import { pushPendingSickEntriesNow } from "@/services/sick-timing.service";

export type SickTimingResult =
  /** In Timing angelegt und verknüpft */
  | { status: "synced" }
  /** Kein Krank-Projekt gewählt oder kein Token: nur lokal */
  | { status: "local" }
  /** Timing nimmt noch keine Einträge an; der Sync trägt ihn nach, sobald der Tag begonnen hat */
  | { status: "future" }
  /** Nicht in Timing; der nächste Sync versucht es erneut */
  | { status: "failed"; error: string };

export type SickFillResult =
  | { created: true; dateKey: string; hours: number; timing: SickTimingResult }
  /** Kein Soll (Wochenende, freier Tag, Feiertag) oder Soll schon erreicht */
  | { created: false; dateKey: string; reason: "noTarget" | "full" };

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

/** Überträgt offene Krank-Einträge und meldet, was aus diesem wurde. */
async function pushSickEntry(
  userId: string,
  entryId: string,
  plan: SickFillPlan,
  now: Date,
): Promise<SickTimingResult> {
  const integration = await prisma.timingIntegration.findUnique({
    where: { userId },
    select: { apiTokenEnc: true, sickProjectId: true },
  });
  if (!integration?.apiTokenEnc || !integration.sickProjectId) {
    return { status: "local" };
  }
  if (plan.startTime.getTime() > now.getTime()) return { status: "future" };

  const stats = await pushPendingSickEntriesNow(userId, now);
  const entry = await prisma.timeEntry.findFirst({
    where: { id: entryId, userId },
    select: { externalId: true },
  });
  // Weg heißt: ein paralleler Sync hat den Timing-Eintrag schon abgerufen
  if (!entry || entry.externalId) return { status: "synced" };
  return {
    status: "failed",
    error: stats?.error ?? "Timing-API nicht erreichbar.",
  };
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
