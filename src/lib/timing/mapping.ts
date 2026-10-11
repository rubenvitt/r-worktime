import { EntrySource, type EntryType } from "@prisma/client";
import { berlinDateKey, berlinDayStart } from "@/lib/dates";
import { detectEntryType } from "@/lib/schemas/timing-import";
import type { TimingApiTimeEntry } from "./client";
import { joinTitleChain, matchesProjectRoot } from "./project-path";

/** Ein für den Sync aufbereiteter Timing-Eintrag (noch ohne userId). */
export interface SyncEntryData {
  externalId: string;
  /** Berlin-Kalendertag des Starts, "YYYY-MM-DD" */
  dateKey: string;
  startTime: Date;
  endTime: Date;
  /** Stunden, 2 Nachkommastellen */
  duration: number;
  type: EntryType;
  description: string | null;
  title: string | null;
  notes: string | null;
  projectPath: string;
  billingStatus: string | null;
}

export type SkipReason = "running" | "noProject" | "outsideRoots" | "invalid";

export type MapResult =
  | { kept: true; entry: SyncEntryData }
  | { kept: false; reason: SkipReason };

export interface FilterStats {
  fetched: number;
  kept: number;
  skipped: Record<SkipReason, number>;
}

function roundHours(hours: number): number {
  return Number(hours.toFixed(2));
}

export function mapApiEntry(
  entry: TimingApiTimeEntry,
  projectRoots: string[],
): MapResult {
  if (entry.is_running) return { kept: false, reason: "running" };

  const chain = entry.project?.title_chain;
  const projectPath = Array.isArray(chain) ? joinTitleChain(chain) : "";
  if (!projectPath) return { kept: false, reason: "noProject" };
  if (!matchesProjectRoot(projectPath, projectRoots)) {
    return { kept: false, reason: "outsideRoots" };
  }

  if (typeof entry.self !== "string" || !entry.self || !entry.end_date) {
    return { kept: false, reason: "invalid" };
  }
  const startTime = new Date(entry.start_date);
  const endTime = new Date(entry.end_date);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return { kept: false, reason: "invalid" };
  }

  const seconds =
    typeof entry.duration === "number" && Number.isFinite(entry.duration)
      ? entry.duration
      : (endTime.getTime() - startTime.getTime()) / 1000;
  if (seconds < 0) return { kept: false, reason: "invalid" };

  const title = entry.title?.trim() || null;
  const notes = entry.notes?.trim() || null;

  return {
    kept: true,
    entry: {
      externalId: entry.self,
      dateKey: berlinDateKey(startTime),
      startTime,
      endTime,
      duration: roundHours(seconds / 3600),
      type: detectEntryType(projectPath),
      // Kompatibilität: Suche und Anzeige nutzen weiterhin description
      description: [title, notes].filter(Boolean).join(" - ") || null,
      title,
      notes,
      projectPath,
      billingStatus: entry.billing_status || null,
    },
  };
}

export function filterAndMapEntries(
  entries: TimingApiTimeEntry[],
  projectRoots: string[],
): { entries: SyncEntryData[]; stats: FilterStats } {
  const stats: FilterStats = {
    fetched: entries.length,
    kept: 0,
    skipped: { running: 0, noProject: 0, outsideRoots: 0, invalid: 0 },
  };
  const kept: SyncEntryData[] = [];

  for (const entry of entries) {
    const result = mapApiEntry(entry, projectRoots);
    if (result.kept) {
      kept.push(result.entry);
      stats.kept++;
    } else {
      stats.skipped[result.reason]++;
    }
  }
  return { entries: kept, stats };
}

/** Felder des lokalen Eintrags, wie der Timing-Sync sie schreibt (ohne userId). */
export function toSyncEntryRow(entry: SyncEntryData) {
  return {
    date: berlinDayStart(entry.dateKey),
    startTime: entry.startTime,
    endTime: entry.endTime,
    duration: entry.duration,
    type: entry.type,
    description: entry.description,
    title: entry.title,
    notes: entry.notes,
    projectPath: entry.projectPath,
    externalId: entry.externalId,
    billingStatus: entry.billingStatus,
    source: EntrySource.TIMING_SYNC,
    importLogId: null,
  };
}
