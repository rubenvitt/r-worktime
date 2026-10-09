// Kalendertage in Europe/Berlin. Ein Datums-Key ist "YYYY-MM-DD";
// @db.Date-Spalten speichern ihn als UTC-Mitternacht des Keys.

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

/**
 * Letzter Kalendertag eines Monats (monthIndex 0–11) als "YYYY-MM-DD".
 * Reine Kalenderrechnung, unabhängig von der Zeitzone des Browsers.
 */
export function monthEndKey(year: number, monthIndex: number): string {
  return monthRange(`${year}-${String(monthIndex + 1).padStart(2, "0")}`)
    .lastKey;
}
