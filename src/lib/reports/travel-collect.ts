// Serverseitig: Arbeitstage eines Jahres für den Reisetage-Bericht sammeln.
// Getrennt von travel.ts, damit der Client nur die Bewertung und den CSV-Export
// lädt, nicht die Stundenzettel-Aggregation.

import { berlinDateKey } from "@/lib/dates";
import { aggregateTimesheet } from "@/lib/timesheet/aggregate";
import {
  isAdjustmentEntry,
  type TimesheetSourceEntry,
  toTimesheetRecord,
  WORK_TYPES,
} from "@/lib/timesheet/entries";
import type { TravelReportDayInput } from "./travel";

/**
 * Arbeitstage eines Jahres aus TimeEntry-Zeilen: nur WORK/OVERTIME, ohne
 * Saldo-Einträge, Tag = Berliner Kalendertag des Starts, Dauer wie im
 * Stundenzettel (toTimesheetRecord, d. h. BULK_FILL zählt mit).
 */
export function collectTravelDays(
  entries: TimesheetSourceEntry[],
  year: number,
): TravelReportDayInput[] {
  const workTypes = new Set<string>(WORK_TYPES);
  const prefix = `${year}-`;
  const relevant = entries.filter(
    (entry) =>
      workTypes.has(entry.type) &&
      !isAdjustmentEntry(entry) &&
      !Number.isNaN(entry.startTime.getTime()) &&
      berlinDateKey(entry.startTime).startsWith(prefix),
  );

  const projectsByDay = new Map<string, Set<string>>();
  for (const entry of relevant) {
    if (!entry.projectPath) continue;
    const key = berlinDateKey(entry.startTime);
    const set = projectsByDay.get(key) ?? new Set<string>();
    set.add(entry.projectPath);
    projectsByDay.set(key, set);
  }

  return aggregateTimesheet(relevant.map(toTimesheetRecord), {
    dayBoundary: "Europe/Berlin",
  }).map((day) => ({
    date: day.date,
    minutes: day.minutes,
    activities: day.activities.map(({ title, minutes }) => ({
      title,
      minutes,
    })),
    projects: Array.from(projectsByDay.get(day.date) ?? []).sort((a, b) =>
      a.localeCompare(b, "de"),
    ),
    suggested: day.travelFee,
  }));
}
