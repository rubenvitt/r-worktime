// Reine Hilfsfunktionen für die Woche (ISO-Kalenderwoche, Überschneidungen).
// Alle Kalendertage als "YYYY-MM-DD" in Europe/Berlin.

import { getISOWeek, getISOWeekYear } from "date-fns";
import { berlinDateKey, berlinTodayKey } from "@/lib/dates";

export interface IsoWeek {
  year: number;
  week: number;
}

/** Mittag UTC eines Kalendertags – ISO-Woche unabhängig von der Zeitzone. */
function noon(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

function keyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Montag der ISO-Woche als "YYYY-MM-DD". */
export function isoWeekMonday(year: number, week: number): string {
  // Der 4. Januar liegt immer in KW 1.
  const jan4 = new Date(Date.UTC(year, 0, 4, 12));
  const weekday = (jan4.getUTCDay() + 6) % 7; // Mo = 0
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - weekday + (week - 1) * 7);
  return keyOf(monday);
}

/** ISO-Woche eines Kalendertags. */
export function isoWeekOf(key: string): IsoWeek {
  const date = noon(key);
  return { year: getISOWeekYear(date), week: getISOWeek(date) };
}

/** Verschiebt eine ISO-Woche um n Wochen. */
export function shiftIsoWeek(
  year: number,
  week: number,
  delta: number,
): IsoWeek {
  const monday = noon(isoWeekMonday(year, week));
  monday.setUTCDate(monday.getUTCDate() + delta * 7);
  return isoWeekOf(keyOf(monday));
}

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
