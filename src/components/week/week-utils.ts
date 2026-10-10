// Reine Hilfsfunktionen für die Woche (ISO-Kalenderwoche, Überschneidungen).
// Alle Kalendertage als "YYYY-MM-DD" in Europe/Berlin.

import {
  berlinDateKey,
  berlinTodayKey,
  type IsoWeek,
  isoWeekOf,
} from "@/lib/dates";

// ISO-Wochen-Logik liegt in @/lib/dates (auch für Services); hier re-exportiert.
export {
  type IsoWeek,
  isoWeekMonday,
  isoWeekOf,
  shiftIsoWeek,
} from "@/lib/dates";

/** Aktuelle ISO-Woche (Berliner Kalendertag). */
export function currentIsoWeek(now: Date = new Date()): IsoWeek {
  return isoWeekOf(berlinTodayKey(now));
}

export function weekHref({ year, week }: IsoWeek): string {
  return `/week/${year}/${week}`;
}

/** Berliner Kalendertag eines API-Datums (Date, ISO-Zeitstempel). */
export function dayKeyOf(value: Date | string): string {
  return berlinDateKey(value instanceof Date ? value : new Date(value));
}

/** "28.09.–04.10.2026" */
export function formatWeekRange(startKey: string, endKey: string): string {
  const dm = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}.`;
  return `${dm(startKey)}–${dm(endKey)}${endKey.slice(0, 4)}`;
}

/** "2026-08-02" → "02.08.2026" */
export function formatDateKey(key: string): string {
  return `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}`;
}

interface Interval {
  id: string;
  startTime: Date | string;
  endTime: Date | string;
}

/**
 * IDs aller Einträge, die sich mit einem anderen überschneiden
 * (start_i < end_j && start_j < end_i).
 */
export function overlappingIds(entries: Interval[]): Set<string> {
  const result = new Set<string>();
  const spans = entries.map((e) => ({
    id: e.id,
    start: new Date(e.startTime).getTime(),
    end: new Date(e.endTime).getTime(),
  }));
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i];
      const b = spans[j];
      if (a.start < b.end && b.start < a.end) {
        result.add(a.id);
        result.add(b.id);
      }
    }
  }
  return result;
}
