import type { TimingIntegration } from "@prisma/client";
import { z } from "zod";
import {
  decryptSecret,
  isEncryptionConfigured,
  secretHint,
} from "@/lib/crypto";
import { dateKeyFromDbDate } from "@/lib/dates";
import { isProjectRef } from "./client";
import {
  DEFAULT_PROJECT_ROOTS,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  DEFAULT_SYNC_WINDOW_DAYS,
  MAX_SYNC_WINDOW_DAYS,
} from "./constants";
import { joinTitleChain, splitProjectPath } from "./project-path";

/** Normalisiert Projekt-Wurzeln ("Work▸Kunde A" → "Work ▸ Kunde A"), ohne Duplikate. */
export function normalizeProjectRoots(roots: string[]): string[] {
  const normalized = roots
    .map((root) => joinTitleChain(splitProjectPath(root)))
    .filter((root) => root.length > 0);
  return Array.from(new Set(normalized));
}

export const timingSettingsUpdateSchema = z.object({
  // undefined = unverändert, null oder "" = löschen
  apiToken: z.string().trim().max(2000).nullable().optional(),
  projectRoots: z
    .array(z.string().max(500))
    .max(50)
    .transform(normalizeProjectRoots)
    .refine((roots) => roots.length > 0, {
      message: "Mindestens eine Projekt-Wurzel angeben",
    })
    .optional(),
  syncEnabled: z.boolean().optional(),
  syncIntervalMinutes: z
    .number()
    .int()
    .min(5, "Intervall mindestens 5 Minuten")
    .max(1440, "Intervall höchstens 1440 Minuten")
    .optional(),
  syncWindowDays: z
    .number()
    .int()
    .min(1, "Fenster mindestens 1 Tag")
    .max(MAX_SYNC_WINDOW_DAYS, `Fenster höchstens ${MAX_SYNC_WINDOW_DAYS} Tage`)
    .optional(),
  writeHolidays: z.boolean().optional(),
  // null = kein Projekt
  holidayProjectId: z
    .string()
    .refine(isProjectRef, { message: "Ungültiges Timing-Projekt" })
    .nullable()
    .optional(),
});

export type TimingSettingsUpdate = z.infer<typeof timingSettingsUpdateSchema>;

export interface PublicTimingSettings {
  hasToken: boolean;
  /** Letzte 4 Zeichen des Tokens; null, wenn nicht entschlüsselbar */
  tokenHint: string | null;
  tokenReadable: boolean;
  encryptionConfigured: boolean;
  schedulerEnabled: boolean;
  projectRoots: string[];
  syncEnabled: boolean;
  syncIntervalMinutes: number;
  syncWindowDays: number;
  writeHolidays: boolean;
  holidayProjectId: string | null;
  /** Erster Tag, der nach Timing geht ("YYYY-MM-DD") */
  holidaysSince: string | null;
}

export interface PublicTimingStatus {
  running: boolean;
  syncEnabled: boolean;
  hasToken: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncStats: unknown;
  nextSyncAt: string | null;
}

export function isSchedulerEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.TIMING_SYNC_SCHEDULER?.trim().toLowerCase() !== "off";
}

export function toPublicSettings(
  integration: TimingIntegration | null,
): PublicTimingSettings {
  const encryptionConfigured = isEncryptionConfigured();
  let tokenHint: string | null = null;
  let tokenReadable = false;

  if (integration?.apiTokenEnc && encryptionConfigured) {
    try {
      tokenHint = secretHint(decryptSecret(integration.apiTokenEnc));
      tokenReadable = true;
    } catch {
      // Schlüssel gewechselt o. Ä. – Token muss neu gesetzt werden
    }
  }

  return {
    hasToken: Boolean(integration?.apiTokenEnc),
    tokenHint,
    tokenReadable,
    encryptionConfigured,
    schedulerEnabled: isSchedulerEnabled(),
    projectRoots: integration?.projectRoots ?? DEFAULT_PROJECT_ROOTS,
    syncEnabled: integration?.syncEnabled ?? false,
    syncIntervalMinutes:
      integration?.syncIntervalMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES,
    syncWindowDays: integration?.syncWindowDays ?? DEFAULT_SYNC_WINDOW_DAYS,
    writeHolidays: integration?.writeHolidays ?? false,
    holidayProjectId: integration?.holidayProjectId ?? null,
    holidaysSince: integration?.holidaysSince
      ? dateKeyFromDbDate(integration.holidaysSince)
      : null,
  };
}

/** Nächster fälliger Lauf; null, wenn Auto-Sync aus ist. */
export function nextSyncDue(
  integration: Pick<
    TimingIntegration,
    "syncEnabled" | "apiTokenEnc" | "syncIntervalMinutes" | "lastSyncAt"
  >,
  now = new Date(),
): Date | null {
  if (!integration.syncEnabled || !integration.apiTokenEnc) return null;
  if (!integration.lastSyncAt) return now;
  return new Date(
    integration.lastSyncAt.getTime() + integration.syncIntervalMinutes * 60_000,
  );
}

export function isSyncDue(
  integration: Parameters<typeof nextSyncDue>[0],
  now = new Date(),
): boolean {
  const due = nextSyncDue(integration, now);
  return due !== null && due.getTime() <= now.getTime();
}

export function toPublicStatus(
  integration: TimingIntegration | null,
  running: boolean,
): PublicTimingStatus {
  const next = integration ? nextSyncDue(integration) : null;
  return {
    running,
    syncEnabled: integration?.syncEnabled ?? false,
    hasToken: Boolean(integration?.apiTokenEnc),
    lastSyncAt: integration?.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: integration?.lastSyncStatus ?? null,
    lastSyncError: integration?.lastSyncError ?? null,
    lastSyncStats: integration?.lastSyncStats ?? null,
    nextSyncAt: next && isSchedulerEnabled() ? next.toISOString() : null,
  };
}
