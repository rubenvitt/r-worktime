import { isEncryptionConfigured, TOKEN_KEY_ENV } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import {
  isSyncRunning,
  SyncInProgressError,
  sanitizeSyncError,
  syncTimingForUser,
} from "@/services/timing-sync.service";
import { isSyncDue } from "./settings";

// Periodischer Timing-Sync im Next-Prozess (gestartet aus src/instrumentation.ts).

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
  } finally {
    state.__timingSchedulerTickRunning = false;
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

  console.info("[timing-sync] Scheduler gestartet (Tick alle 5 Minuten)");
  return true;
}
