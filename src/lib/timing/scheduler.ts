import { isCalendarSyncDue } from "@/lib/calendar/settings";
import { isEncryptionConfigured, TOKEN_KEY_ENV } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import {
  CalendarSyncInProgressError,
  isCalendarSyncRunning,
  syncCalendarForUser,
} from "@/services/calendar-sync.service";
import {
  isSyncRunning,
  SyncInProgressError,
  sanitizeSyncError,
  syncTimingForUser,
} from "@/services/timing-sync.service";
import { isSyncDue } from "./settings";

// Periodischer Timing-Sync und Kalender-Abgleich (Timewarp) im Next-Prozess
// (gestartet aus src/instrumentation.ts). Beide Teile haben eigene
// Fälligkeitsprüfungen und eigene Fehlerbehandlung.

export const SCHEDULER_TICK_MS = 5 * 60_000;
const FIRST_TICK_DELAY_MS = 60_000;

const state = globalThis as unknown as {
  __timingSchedulerStarted?: boolean;
  __timingSchedulerTickRunning?: boolean;
  __timingSchedulerKeyWarned?: boolean;
};

export async function runSchedulerTick(now = new Date()): Promise<void> {
  if (state.__timingSchedulerTickRunning) return;
  state.__timingSchedulerTickRunning = true;

  try {
    await runTimingSyncs(now);
    try {
      await runCalendarSyncs(now);
    } catch (error) {
      console.error(
        `[calendar-sync] Tick fehlgeschlagen: ${error instanceof Error ? error.name : "unbekannter Fehler"}`,
      );
    }
  } finally {
    state.__timingSchedulerTickRunning = false;
  }
}

async function runTimingSyncs(now: Date): Promise<void> {
  try {
    if (!isEncryptionConfigured()) {
      if (!state.__timingSchedulerKeyWarned) {
        console.warn(
          `[timing-sync] ${TOKEN_KEY_ENV} fehlt oder ist ungültig – automatischer Sync pausiert.`,
        );
        state.__timingSchedulerKeyWarned = true;
      }
      return;
    }

    const integrations = await prisma.timingIntegration.findMany({
      where: { syncEnabled: true, apiTokenEnc: { not: null } },
      select: {
        userId: true,
        syncEnabled: true,
        apiTokenEnc: true,
        syncIntervalMinutes: true,
        lastSyncAt: true,
      },
    });

    // Nacheinander, um das Rate-Limit der Timing-API zu schonen
    for (const integration of integrations) {
      if (!isSyncDue(integration, now) || isSyncRunning(integration.userId)) {
        continue;
      }
      try {
        const stats = await syncTimingForUser(integration.userId, {
          trigger: "scheduler",
        });
        console.info(
          `[timing-sync] User ${integration.userId}: ${stats.created} neu, ${stats.updated} geändert, ${stats.deleted + stats.replacedFileImports} entfernt`,
        );
      } catch (error) {
        if (error instanceof SyncInProgressError) continue;
        console.error(
          `[timing-sync] User ${integration.userId} fehlgeschlagen: ${sanitizeSyncError(error)}`,
        );
      }
    }
  } catch (error) {
    console.error(
      `[timing-sync] Tick fehlgeschlagen: ${sanitizeSyncError(error)}`,
    );
  }
}

/** Stündlicher Kalender-Abgleich je aktiver Integration, nacheinander. */
export async function runCalendarSyncs(now = new Date()): Promise<void> {
  if (!isEncryptionConfigured()) return;

  const integrations = await prisma.calendarIntegration.findMany({
    where: { syncEnabled: true, feedUrlEnc: { not: null } },
    select: {
      userId: true,
      syncEnabled: true,
      feedUrlEnc: true,
      lastSyncAt: true,
    },
  });

  for (const integration of integrations) {
    if (
      !isCalendarSyncDue(integration, now) ||
      isCalendarSyncRunning(integration.userId)
    ) {
      continue;
    }
    try {
      const result = await syncCalendarForUser(integration.userId, {
        trigger: "scheduler",
      });
      const { stats } = result;
      if (result.status === "success") {
        console.info(
          `[calendar-sync] User ${integration.userId}: ${stats.created + stats.timingCreated + stats.timingAdopted} neu, ${stats.linked} verknüpft, ${stats.deleted} gelöscht, ${stats.failed} fehlgeschlagen`,
        );
      } else {
        console.warn(
          `[calendar-sync] User ${integration.userId}: ${result.error}`,
        );
      }
    } catch (error) {
      if (error instanceof CalendarSyncInProgressError) continue;
      console.error(
        `[calendar-sync] User ${integration.userId} fehlgeschlagen: ${error instanceof Error ? error.name : "unbekannter Fehler"}`,
      );
    }
  }
}

/** Startet den Scheduler genau einmal pro Prozess. */
export function startTimingScheduler(): boolean {
  if (state.__timingSchedulerStarted) return false;
  state.__timingSchedulerStarted = true;

  const tick = () => {
    void runSchedulerTick();
  };
  setTimeout(tick, FIRST_TICK_DELAY_MS).unref?.();
  setInterval(tick, SCHEDULER_TICK_MS).unref?.();

  console.info(
    "[timing-sync] Scheduler gestartet (Tick alle 5 Minuten, inkl. Kalender-Abgleich)",
  );
  return true;
}
