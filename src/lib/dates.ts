// Kalendertage in Europe/Berlin. Ein Datums-Key ist "YYYY-MM-DD";
// @db.Date-Spalten speichern ihn als UTC-Mitternacht des Keys.

import { getISOWeek, getISOWeekYear } from "date-fns";

export const BERLIN_TIME_ZONE = "Europe/Berlin";

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
// ISO-Zeitstempel mit explizitem Offset oder "Z"
const HAS_OFFSET_PATTERN = /T.*(Z|[+-]\d{2}:?\d{2})$/i;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Kalendertag eines Zeitpunkts in der angegebenen Zeitzone (Default Berlin). */
export function zonedDateKey(date: Date, timeZone: string): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Ungültiges Datum");
  }
  const parts = getFormatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function berlinDateKey(date: Date): string {
  return zonedDateKey(date, BERLIN_TIME_ZONE);
}

export function isDateKey(value: string): boolean {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** UTC-Mitternacht des Keys – so wie @db.Date-Werte gespeichert und gelesen werden. */
export function berlinDayStart(key: string): Date {
  if (!isDateKey(key)) {
    throw new RangeError(`Ungültiger Datums-Key: ${key}`);
  }
  return new Date(`${key}T00:00:00.000Z`);
}

/** Key eines @db.Date-Werts (UTC-Mitternacht) zurück in "YYYY-MM-DD". */
export function dateKeyFromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Tag eines ISO-Zeitstempels aus einem Export: mit Offset → Berlin-Kalendertag
 * des Zeitpunkts; ohne Offset ist er bereits Ortszeit → Datumsanteil übernehmen.
 */
export function dateKeyFromIsoTimestamp(iso: string): string {
  const trimmed = iso.trim();
  if (HAS_OFFSET_PATTERN.test(trimmed)) {
    return berlinDateKey(new Date(trimmed));
  }
  const prefix = trimmed.slice(0, 10);
  if (!isDateKey(prefix)) {
    throw new RangeError(`Ungültiger Zeitstempel: ${iso}`);
  }
  return prefix;
}

/** Verschiebt einen Key um n Kalendertage. */
export function shiftDateKey(key: string, days: number): string {
  const date = berlinDayStart(key);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyFromDbDate(date);
}

/** Heutiger Kalendertag in Berlin. */
export function berlinTodayKey(now: Date = new Date()): string {
  return berlinDateKey(now);
}

export interface MonthRange {
  /** Erster Tag des Monats, "YYYY-MM-DD" */
  firstKey: string;
  /** Letzter Tag des Monats, "YYYY-MM-DD" (inklusive) */
  lastKey: string;
  /** UTC-Mitternacht des ersten Tags (inklusive, für @db.Date gte) */
  start: Date;
  /** UTC-Mitternacht des letzten Tags (inklusive, für @db.Date lte) */
  end: Date;
}

/** Monatsgrenzen für "YYYY-MM"; Enden sind inklusiv. */
export function monthRange(month: string): MonthRange {
  const match = MONTH_PATTERN.exec(month);
  const m = match ? Number(match[2]) : 0;
  if (!match || m < 1 || m > 12) {
    throw new RangeError(`Ungültiger Monat: ${month}`);
  }
  const y = Number(match[1]);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  const firstKey = `${y}-${mm}-01`;
  const lastKey = `${y}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return {
    firstKey,
    lastKey,
    start: berlinDayStart(firstKey),
    end: berlinDayStart(lastKey),
  };
}

/** Verschiebt einen Monat "YYYY-MM" um n Monate: "2026-12", +1 → "2027-01". */
export function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const monthNumber = index - year * 12 + 1;
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

/** count Monate bis einschließlich endMonth, aufsteigend. */
export function monthsEndingAt(endMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    shiftMonthKey(endMonth, i - (count - 1)),
  );
}

/**
 * Letzter Kalendertag eines Monats (monthIndex 0–11) als "YYYY-MM-DD".
 * Reine Kalenderrechnung, unabhängig von der Zeitzone des Browsers.
 */
export function monthEndKey(year: number, monthIndex: number): string {
  return monthRange(`${year}-${String(monthIndex + 1).padStart(2, "0")}`)
    .lastKey;
}

// ---------------------------------------------------------------------------
// ISO-8601-Kalenderwochen: Woche beginnt Montag, KW 1 enthält den 4. Januar
// (= den ersten Donnerstag). Gerechnet wird immer auf dem Berliner Kalendertag.

export interface IsoWeek {
  /** ISO-Wochenjahr; weicht um den Jahreswechsel vom Kalenderjahr ab */
  year: number;
  week: number;
}

/** Mittag UTC eines Keys – date-fns rechnet dann in jeder Rechner-Zeitzone denselben Tag. */
function noonOfKey(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

/** ISO-Woche eines Kalendertags ("YYYY-MM-DD"). */
export function isoWeekOf(key: string): IsoWeek {
  if (!isDateKey(key)) {
    throw new RangeError(`Ungültiger Datums-Key: ${key}`);
  }
  const date = noonOfKey(key);
  return { year: getISOWeekYear(date), week: getISOWeek(date) };
}

/** Anzahl der ISO-Wochen eines Wochenjahrs (52 oder 53). Der 28.12. liegt immer in der letzten. */
export function isoWeeksInYear(year: number): number {
  return isoWeekOf(`${String(year).padStart(4, "0")}-12-28`).week;
}

export function isValidIsoWeek(year: number, week: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(week) &&
    year >= 1000 &&
    year <= 9999 &&
    week >= 1 &&
    week <= isoWeeksInYear(year)
  );
}

/**
 * Montag einer ISO-Woche als "YYYY-MM-DD". Reine Kalenderrechnung;
 * Wochen außerhalb des Jahres laufen ins Nachbarjahr über (für Verschiebungen).
 */
export function isoWeekMonday(year: number, week: number): string {
  // Der 4. Januar liegt immer in KW 1.
  const jan4 = new Date(Date.UTC(year, 0, 4, 12));
  const weekday = (jan4.getUTCDay() + 6) % 7; // Mo = 0
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - weekday + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

/** Verschiebt eine ISO-Woche um n Wochen. */
export function shiftIsoWeek(
  year: number,
  week: number,
  delta: number,
): IsoWeek {
  return isoWeekOf(shiftDateKey(isoWeekMonday(year, week), delta * 7));
}

export interface IsoWeekRange extends IsoWeek {
  /** Montag, "YYYY-MM-DD" */
  firstKey: string;
  /** Sonntag, "YYYY-MM-DD" (inklusive) */
  lastKey: string;
  /** Alle sieben Tage Montag bis Sonntag */
  dayKeys: string[];
  /** UTC-Mitternacht des Montags (inklusive, für @db.Date gte) */
  start: Date;
  /** UTC-Mitternacht des Sonntags (inklusive, für @db.Date lte) */
  end: Date;
}

/** Grenzen einer ISO-Woche; wirft bei Wochen, die es im Jahr nicht gibt (z. B. KW 53/2027). */
export function isoWeekRange(year: number, week: number): IsoWeekRange {
  if (!isValidIsoWeek(year, week)) {
    throw new RangeError(`Ungültige ISO-Woche: ${year}-W${week}`);
  }
  const firstKey = isoWeekMonday(year, week);
  const dayKeys = Array.from({ length: 7 }, (_, i) =>
    shiftDateKey(firstKey, i),
  );
  const lastKey = dayKeys[6];
  return {
    year,
    week,
    firstKey,
    lastKey,
    dayKeys,
    start: berlinDayStart(firstKey),
    end: berlinDayStart(lastKey),
  };
}

/** Wochentag eines Keys: 0 = Sonntag, 1 = Montag, …, 6 = Samstag (wie UserSettings.workDays). */
export function weekdayOfKey(key: string): number {
  return berlinDayStart(key).getUTCDay();
}

/** Kalenderjahre von from bis to ("YYYY-MM-DD", beide inklusive), aufsteigend. */
export function yearsOfRange(from: string, to: string): number[] {
  const years: number[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    years.push(y);
  }
  return years;
}

const berlinPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BERLIN_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * ISO-Zeitstempel in Berliner Ortszeit mit Offset, sekundengenau,
 * z. B. 2026-12-21T08:00:00+01:00 (für APIs, die die Ortszeit erwarten).
 */
export function berlinIsoString(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Ungültiges Datum");
  }
  const parts = berlinPartsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const wallClock = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second")),
  );
  const offsetMinutes = Math.round(
    (wallClock - Math.floor(date.getTime() / 1000) * 1000) / 60_000,
  );
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offset}`;
}
