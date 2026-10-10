// Reine Abbildungen von TimeEntry-Zeilen auf Stundenzettel-Datensätze und Timing-JSON.

import { isAdjustmentEntry } from "@/lib/adjustment-marker";
import { BERLIN_TIME_ZONE, berlinDateKey } from "@/lib/dates";
import {
  joinTitleChain,
  matchesProjectRoot,
  splitProjectPath,
} from "@/lib/timing/project-path";
import { type TimesheetRecord, UNTITLED } from "./aggregate";

/** Ausschnitt einer TimeEntry-Zeile, den der Stundenzettel braucht. */
export interface TimesheetSourceEntry {
  id: string;
  startTime: Date;
  endTime: Date;
  type: string;
  source: string;
  title: string | null;
  notes: string | null;
  description: string | null;
  projectPath: string | null;
  billingStatus: string | null;
  /** Stunden laut duration-Spalte */
  duration?: number | null;
}

export const WORK_TYPES = ["WORK", "OVERTIME"] as const;
export const ABSENCE_TYPES = ["VACATION", "SICK", "HOLIDAY"] as const;

export interface TimesheetFilter {
  /** "YYYY-MM" */
  month: string;
  /** Projekt-Teilbaum, z. B. "Work" oder "Work ▸ Kunde A"; null = alles */
  root: string | null;
  includeAbsences: boolean;
}

export { isAdjustmentEntry };

/**
 * Filtert auf Typ, Projekt-Teilbaum und Berlin-Monat des Starts; der Saldo
 * fliegt immer raus. Reihenfolge bleibt erhalten (= Eingabereihenfolge).
 */
export function filterTimesheetEntries<T extends TimesheetSourceEntry>(
  entries: T[],
  filter: TimesheetFilter,
): T[] {
  const types = new Set<string>(
    filter.includeAbsences ? [...WORK_TYPES, ...ABSENCE_TYPES] : WORK_TYPES,
  );
  const monthPrefix = `${filter.month}-`;
  return entries.filter((entry) => {
    if (!types.has(entry.type)) return false;
    if (isAdjustmentEntry(entry)) return false;
    if (Number.isNaN(entry.startTime.getTime())) return false;
    if (!berlinDateKey(entry.startTime).startsWith(monthPrefix)) return false;
    if (filter.root) {
      return (
        !!entry.projectPath &&
        matchesProjectRoot(entry.projectPath, [filter.root])
      );
    }
    return true;
  });
}

/** Titel-Fallback für Altdaten: title || description || projectPath || "Ohne Titel". */
export function entryTitle(
  entry: Pick<TimesheetSourceEntry, "title" | "description" | "projectPath">,
): string {
  return entry.title || entry.description || entry.projectPath || UNTITLED;
}

/** Quellen, bei denen duration nur gerundet aus Ende − Start stammt. */
const TIMING_SOURCES = new Set(["TIMING_SYNC", "FILE_IMPORT"]);

/**
 * Ende, das zu r-worktimes eigener Rechnung passt: Bei Timing-Daten zählt
 * Ende − Start (duration ist dort auf 0,01 h gerundet). Bei manuellen,
 * Bulk-Fill- oder Feiertags-Einträgen ist duration unabhängig eingebbar und
 * maßgeblich, z. B. 7,5 h bei 09:00–17:00 → Ende = Start + 7,5 h.
 */
export function effectiveEndTime(
  entry: Pick<
    TimesheetSourceEntry,
    "startTime" | "endTime" | "source" | "duration"
  >,
): Date {
  const hours = entry.duration;
  if (
    TIMING_SOURCES.has(entry.source) ||
    hours == null ||
    !Number.isFinite(hours) ||
    hours < 0
  ) {
    return entry.endTime;
  }
  return new Date(entry.startTime.getTime() + Math.round(hours * 3_600_000));
}

export function toTimesheetRecord(
  entry: TimesheetSourceEntry,
): TimesheetRecord {
  return {
    start: entry.startTime,
    end: effectiveEndTime(entry),
    title: entryTitle(entry),
    notes: entry.notes ?? "",
  };
}

/** Alle Präfixe aller Pfade, dedupliziert und sortiert ("Work", "Work ▸ A", …). */
export function expandProjectRoots(paths: Iterable<string | null>): string[] {
  const roots = new Set<string>();
  for (const path of paths) {
    if (!path) continue;
    const segments = splitProjectPath(path);
    for (let i = 1; i <= segments.length; i++) {
      roots.add(joinTitleChain(segments.slice(0, i)));
    }
  }
  return Array.from(roots).sort((a, b) => a.localeCompare(b, "de"));
}

const berlinPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BERLIN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "longOffset",
});

/** ISO 8601 mit Berliner Offset, z. B. "2026-03-02T08:00:00+01:00". */
export function formatBerlinIso(date: Date): string {
  const parts = berlinPartsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  // "GMT+01:00" bzw. "GMT" bei Offset 0
  const zone = get("timeZoneName").replace("GMT", "");
  const offset = zone === "" ? "+00:00" : zone;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offset}`;
}

/** Sekunden → "H:MM:SS" (Timing-Exportformat). */
export function formatDurationHms(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export interface TimingExportEntry {
  activityTitle?: string;
  activityType: "Time Entry";
  billingStatus?: string;
  duration: string;
  startDate: string;
  endDate: string;
  notes?: string;
  project: string;
}

/**
 * Rohdaten im Timing-JSON-Exportformat. Fehlt ein Titel, bleibt activityTitle
 * weg – r-times fällt dann wie der Stundenzettel auf project zurück.
 */
export function toTimingExportEntry(
  entry: TimesheetSourceEntry,
): TimingExportEntry {
  const activityTitle = entry.title || entry.description || undefined;
  const endTime = effectiveEndTime(entry);
  const result: TimingExportEntry = {
    activityTitle,
    activityType: "Time Entry",
    billingStatus: entry.billingStatus ?? undefined,
    duration: formatDurationHms(
      (endTime.getTime() - entry.startTime.getTime()) / 1000,
    ),
    startDate: formatBerlinIso(entry.startTime),
    endDate: formatBerlinIso(endTime),
    notes: entry.notes ?? undefined,
    project: entry.projectPath ?? "",
  };
  return result;
}
