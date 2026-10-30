// „Krank“ für einen Problemtag: rein, ohne DB und API. Wie viel fehlt bis zum
// Tagessoll, wann liegt der Eintrag, welches Timing-Projekt passt?

import { berlinWallClock } from "@/lib/absence-range";
import { detectEntryType } from "@/lib/schemas/timing-import";
import type { TimingApiTimeEntry } from "./client";

/** Titel und Beschreibung des Auffüll-Eintrags. */
export const SICK_FILL_TITLE = "Krank";

/** Grund beim Prüfen eines Tags, der den Auffüll-Eintrag auslöst. */
export const SICK_REVIEW_REASON = "Krankheit";

/** Notiz an Krank-Einträgen, die R-Worktime in Timing anlegt. */
export const SICK_TIMING_NOTE = "Krank aus R-Worktime";

/** Ohne vorhandene Einträge beginnt der Krank-Eintrag um 08:00 Berliner Zeit. */
const SICK_START_HOUR = 8;

/** Vorhandener Eintrag am Tag, so weit die Planung ihn braucht. */
export interface SickFillDayEntry {
  startTime: Date;
  endTime: Date;
  /** Stunden */
  duration: number;
}

export interface SickFillPlan {
  startTime: Date;
  endTime: Date;
  /** Stunden, 2 Nachkommastellen */
  hours: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Plant den Krank-Eintrag, der den Tag auf das Soll auffüllt: Beginn nach dem
 * letzten vorhandenen Eintrag, sonst 08:00. Null, wenn nichts fehlt.
 */
export function planSickFill(
  dateKey: string,
  dayEntries: readonly SickFillDayEntry[],
  dailyHours: number,
): SickFillPlan | null {
  const covered = dayEntries.reduce((sum, entry) => sum + entry.duration, 0);
  const hours = round2(dailyHours - covered);
  if (!(hours > 0)) return null;

  let start = berlinWallClock(dateKey, SICK_START_HOUR).getTime();
  for (const entry of dayEntries) {
    start = Math.max(start, entry.endTime.getTime());
  }
  return {
    startTime: new Date(start),
    endTime: new Date(start + Math.round(hours * 60) * 60_000),
    hours,
  };
}

/**
 * Erkennt der Timing-Sync Einträge in diesem Projekt als Krankheit? Sonst
 * übernähme er den Krank-Eintrag als Arbeitszeit.
 */
export function isSickProjectPath(path: string): boolean {
  return detectEntryType(path) === "SICK";
}

/** Vorschlag: erstes Projekt, das der Sync als Krankheit erkennt. */
export function suggestSickProject<T extends { path: string }>(
  projects: readonly T[],
): T | null {
  return projects.find((project) => isSickProjectPath(project.path)) ?? null;
}

/** Lokaler Krank-Eintrag ohne Timing-ID, der nach Timing soll. */
export interface PendingSickEntry {
  id: string;
  startTime: Date;
  endTime: Date;
  title: string;
  notes: string | null;
}

export interface SickPushPlan {
  /** Gleicher Eintrag schon in Timing (z. B. aus einem abgebrochenen Lauf): nur verknüpfen */
  adopt: Array<{ id: string; self: string }>;
  create: PendingSickEntry[];
}

/** Krank-Einträge, die Timing schon annimmt (Beginn erreicht). */
export function startedSickEntries<T extends { startTime: Date }>(
  pending: readonly T[],
  now: Date,
): T[] {
  return pending.filter((entry) => entry.startTime.getTime() <= now.getTime());
}

/**
 * Plant den Eintrag in Timing. `inTiming` sind die Einträge im Krank-Projekt,
 * `usedSelves` deren IDs, die lokal schon an einem Eintrag hängen. Übernommen
 * wird nur ein Timing-Eintrag mit genau gleichem Beginn und Ende.
 */
export function planSickPush(
  pending: readonly PendingSickEntry[],
  inTiming: readonly TimingApiTimeEntry[],
  usedSelves: ReadonlySet<string>,
): SickPushPlan {
  const candidates = new Map<string, string[]>();
  for (const entry of inTiming) {
    if (entry.is_running || !entry.end_date || usedSelves.has(entry.self)) {
      continue;
    }
    const start = Date.parse(entry.start_date);
    const end = Date.parse(entry.end_date);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const key = `${start}-${end}`;
    candidates.set(key, [...(candidates.get(key) ?? []), entry.self]);
  }

  const plan: SickPushPlan = { adopt: [], create: [] };
  for (const entry of pending) {
    const key = `${entry.startTime.getTime()}-${entry.endTime.getTime()}`;
    const self = candidates.get(key)?.shift();
    if (self) plan.adopt.push({ id: entry.id, self });
    else plan.create.push(entry);
  }
  return plan;
}
