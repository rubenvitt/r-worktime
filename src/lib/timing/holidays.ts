// Feiertage nach Timing: rein, ohne DB und API. Welche lokalen Feiertags-
// Einträge gehen nach Timing, welche übernehmen einen vorhandenen Eintrag?

import { timewarpDayTimes } from "@/lib/calendar/plan-days";
import { berlinDateKey } from "@/lib/dates";
import { detectEntryType } from "@/lib/schemas/timing-import";
import type { TimingApiTimeEntry } from "./client";

/** Notiz an Feiertags-Einträgen, die R-Worktime in Timing anlegt. */
export const HOLIDAY_TIMING_NOTE = "Feiertag aus R-Worktime";

/** Lokaler Feiertags-Eintrag ohne Timing-ID. */
export interface PendingHoliday {
  id: string;
  /** "YYYY-MM-DD" */
  dateKey: string;
  /** Stunden (Tagessoll beim Import) */
  duration: number;
  /** Name des Feiertags */
  title: string;
}

export interface HolidayCreate {
  id: string;
  dateKey: string;
  start: Date;
  end: Date;
  title: string;
}

export interface HolidayPushPlan {
  /** Vorhandener Timing-Eintrag am Tag: nur dessen ID übernehmen */
  adopt: Array<{ id: string; dateKey: string; self: string }>;
  create: HolidayCreate[];
}

/**
 * Zeiten in Timing: 08:00 Berliner Zeit plus Dauer, wie die Urlaubstage.
 * Timing nimmt nur Einträge an, die schon begonnen haben.
 */
export function holidayTimingTimes(
  dateKey: string,
  hours: number,
): { start: Date; end: Date } {
  const { startTime, endTime } = timewarpDayTimes(dateKey, hours);
  return { start: startTime, end: endTime };
}

/** Feiertage, deren Eintrag in Timing schon begonnen hätte. */
export function startedHolidays(
  pending: readonly PendingHoliday[],
  now: Date,
): PendingHoliday[] {
  return pending.filter(
    (holiday) =>
      holiday.duration > 0 &&
      holidayTimingTimes(holiday.dateKey, holiday.duration).start.getTime() <=
        now.getTime(),
  );
}

/**
 * Plant den Eintrag in Timing. `inTiming` sind die Einträge im Feiertags-
 * Projekt, `usedSelves` deren IDs, die lokal schon an einem Eintrag hängen.
 * Je Tag wird höchstens ein Timing-Eintrag übernommen.
 */
export function planHolidayPush(
  pending: readonly PendingHoliday[],
  inTiming: readonly TimingApiTimeEntry[],
  usedSelves: ReadonlySet<string>,
): HolidayPushPlan {
  const candidates = new Map<string, string[]>();
  for (const entry of inTiming) {
    if (entry.is_running || usedSelves.has(entry.self)) continue;
    const start = new Date(entry.start_date);
    if (Number.isNaN(start.getTime())) continue;
    const key = berlinDateKey(start);
    candidates.set(key, [...(candidates.get(key) ?? []), entry.self]);
  }

  const plan: HolidayPushPlan = { adopt: [], create: [] };
  for (const holiday of pending) {
    const self = candidates.get(holiday.dateKey)?.shift();
    if (self) {
      plan.adopt.push({ id: holiday.id, dateKey: holiday.dateKey, self });
    } else {
      plan.create.push({
        id: holiday.id,
        dateKey: holiday.dateKey,
        title: holiday.title,
        ...holidayTimingTimes(holiday.dateKey, holiday.duration),
      });
    }
  }
  return plan;
}

/**
 * Erkennt der Timing-Sync Einträge in diesem Projekt als Feiertag? Sonst
 * zählte ein nicht verknüpfter Eintrag darin als Arbeitszeit.
 */
export function isHolidayProjectPath(path: string): boolean {
  return detectEntryType(path) === "HOLIDAY";
}

/** Vorschlag: erstes Projekt, das der Sync als Feiertag erkennt. */
export function suggestHolidayProject<T extends { path: string }>(
  projects: readonly T[],
): T | null {
  return projects.find((project) => isHolidayProjectPath(project.path)) ?? null;
}
