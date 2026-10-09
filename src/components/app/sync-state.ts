import type { Tone } from "@/components/app/status-badge";
import type { PublicTimingStatus } from "@/lib/timing/settings";

export type SyncState =
  | "not-connected"
  | "running"
  | "failed"
  | "never"
  | "stale"
  | "ok";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Zustand des Timing-Syncs aus dem öffentlichen Status. */
export function deriveSyncState(
  s: PublicTimingStatus | undefined,
  now: Date = new Date(),
): SyncState {
  if (!s?.hasToken) return "not-connected";
  if (s.running) return "running";
  if (s.lastSyncStatus && s.lastSyncStatus !== "SUCCESS") return "failed";
  if (!s.lastSyncAt) return "never";
  if (now.getTime() - new Date(s.lastSyncAt).getTime() > STALE_AFTER_MS) {
    return "stale";
  }
  return "ok";
}

export const SYNC_STATE_LABEL: Record<SyncState, string> = {
  "not-connected": "Timing nicht verbunden",
  running: "Synchronisiere …",
  failed: "Sync fehlgeschlagen",
  never: "Noch nie synchronisiert",
  stale: "Sync veraltet",
  ok: "Sync aktuell",
};

export const SYNC_STATE_TONE: Record<SyncState, Tone> = {
  "not-connected": "neutral",
  running: "info",
  failed: "negative",
  never: "warning",
  stale: "warning",
  ok: "positive",
};
