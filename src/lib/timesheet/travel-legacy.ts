// Übernahme der früheren Reisetag-Korrekturen aus dem localStorage
// (Schlüssel rwt.timesheet.travel.<JJJJ-MM>, Wert { "JJJJ-MM-TT": boolean }).

import { isDateKey } from "@/lib/dates";

export const LEGACY_TRAVEL_PREFIX = "rwt.timesheet.travel.";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function legacyTravelKey(month: string): string {
  return `${LEGACY_TRAVEL_PREFIX}${month}`;
}

export interface LegacyTravelDecision {
  date: string;
  isTravel: boolean;
}

export interface LegacyTravelData {
  /** alle Schlüssel mit dem Präfix – auch kaputte, damit sie aufgeräumt werden */
  keys: string[];
  /** gültige Festlegungen, je Tag höchstens eine */
  decisions: LegacyTravelDecision[];
}

export function parseLegacyTravelStorage(
  items: Iterable<readonly [string, string | null]>,
): LegacyTravelData {
  const keys: string[] = [];
  const byDate = new Map<string, boolean>();

  for (const [key, raw] of items) {
    if (!key.startsWith(LEGACY_TRAVEL_PREFIX)) continue;
    keys.push(key);

    const month = key.slice(LEGACY_TRAVEL_PREFIX.length);
    if (!MONTH_PATTERN.test(month) || !raw) continue;

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    for (const [date, isTravel] of Object.entries(value)) {
      if (typeof isTravel !== "boolean") continue;
      if (!isDateKey(date) || !date.startsWith(`${month}-`)) continue;
      byDate.set(date, isTravel);
    }
  }

  const decisions = Array.from(byDate.entries())
    .map(([date, isTravel]) => ({ date, isTravel }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { keys, decisions };
}
