// Einstellungen der Kalender-Integration: Validierung, öffentliche Sicht,
// Fälligkeit des automatischen Abgleichs.

import type { CalendarIntegration } from "@prisma/client";
import { z } from "zod";
import { decryptSecret } from "@/lib/crypto";
import { isProjectRef } from "@/lib/timing/client";
import { feedHostOf } from "./feed";
import {
  CALENDAR_SYNC_INTERVAL_MINUTES,
  type CalendarSyncStats,
  type PublicCalendarSettings,
} from "./types";

export const calendarSettingsUpdateSchema = z.strictObject(
  {
    // undefined = unverändert, null oder "" = löschen
    feedUrl: z
      .string({ error: "Die Feed-URL muss ein Text sein." })
      .trim()
      .max(2000, "Die Feed-URL ist zu lang.")
      .nullable()
      .optional(),
    syncEnabled: z
      .boolean({ error: "„Automatisch abgleichen“ muss an oder aus sein." })
      .optional(),
    writeToTiming: z
      .boolean({
        error: "„Urlaube in Timing eintragen“ muss an oder aus sein.",
      })
      .optional(),
    timingProjectId: z
      .string({ error: "Ungültiges Timing-Projekt." })
      .trim()
      .refine((value) => value === "" || isProjectRef(value), {
        message: "Ungültiges Timing-Projekt.",
      })
      .nullable()
      .optional(),
  },
  {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `Unbekannte Einstellung: ${issue.keys.join(", ")}`
        : "Ungültige Anfrage",
  },
);

export type CalendarSettingsUpdate = z.infer<
  typeof calendarSettingsUpdateSchema
>;

/** Host der gespeicherten Feed-URL; null, wenn nicht entschlüsselbar. */
export function storedFeedHost(feedUrlEnc: string | null): string | null {
  if (!feedUrlEnc) return null;
  try {
    return feedHostOf(decryptSecret(feedUrlEnc));
  } catch {
    return null;
  }
}

export function toPublicCalendarSettings(
  integration: CalendarIntegration | null,
  timingConnected: boolean,
): PublicCalendarSettings {
  return {
    configured: Boolean(integration?.feedUrlEnc),
    feedHost: storedFeedHost(integration?.feedUrlEnc ?? null),
    syncEnabled: integration?.syncEnabled ?? false,
    writeToTiming: integration?.writeToTiming ?? true,
    timingProjectId: integration?.timingProjectId ?? null,
    timingConnected,
    lastSyncAt: integration?.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: integration?.lastSyncStatus ?? null,
    lastSyncError: integration?.lastSyncError ?? null,
    lastSyncStats:
      (integration?.lastSyncStats as CalendarSyncStats | null | undefined) ??
      null,
  };
}

/** Automatischer Abgleich fällig: aktiv, Feed hinterlegt, letzter Lauf ≥ 1 h her. */
export function isCalendarSyncDue(
  integration: Pick<
    CalendarIntegration,
    "syncEnabled" | "feedUrlEnc" | "lastSyncAt"
  >,
  now = new Date(),
): boolean {
  if (!integration.syncEnabled || !integration.feedUrlEnc) return false;
  if (!integration.lastSyncAt) return true;
  return (
    integration.lastSyncAt.getTime() +
      CALENDAR_SYNC_INTERVAL_MINUTES * 60_000 <=
    now.getTime()
  );
}
