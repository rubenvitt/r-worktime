// Einheitliche Darstellung von Dauern, Salden und Datumsangaben.
// Rein, ohne React. Alle Kalenderangaben in Europe/Berlin.

import { BERLIN_TIME_ZONE, berlinDateKey, shiftDateKey } from "@/lib/dates";

/** Echtes Minuszeichen (U+2212) */
export const MINUS = "−";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^(\d{4})-(\d{2})$/;
const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  // Reiner Kalendertag: Mittag UTC, damit er in Berlin derselbe Tag bleibt
  if (DATE_KEY.test(value)) return new Date(`${value}T12:00:00Z`);
  return new Date(value);
}

/** Kalendertag "YYYY-MM-DD" in Berlin; "YYYY-MM-DD" bleibt unverändert. */
function dayKey(value: Date | string): string {
  if (typeof value === "string" && DATE_KEY.test(value)) return value;
  return berlinDateKey(toDate(value));
}

const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: BERLIN_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const longDateFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const monthFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

function clock(date: Date): string {
  return timeFormatter.format(date);
}

function dayMonth(key: string): string {
  return `${key.slice(8, 10)}.${key.slice(5, 7)}.`;
}

/** 475 → "7:55", 23910 → "398:30". Negative Werte: Minus + Betrag. */
export function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  const abs = Math.abs(rounded);
  const text = `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
  return rounded < 0 ? `${MINUS}${text}` : text;
}

/** 30 → "+0:30", -195 → "−3:15", 0 → "±0:00", null/undefined → "—" */
export function formatDelta(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) {
    return "—";
  }
  const rounded = Math.round(minutes);
  if (rounded === 0) return "±0:00";
  const text = formatDuration(Math.abs(rounded));
  return rounded > 0 ? `+${text}` : `${MINUS}${text}`;
}

/** API-Dezimalstunden → Minuten: Math.round(h * 60) */
export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

/** formatDuration(hoursToMinutes(h)) */
export function formatHours(hours: number): string {
  return formatDuration(hoursToMinutes(hours));
}

/** formatDelta(hoursToMinutes(h)) */
export function formatHoursDelta(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return formatDelta(hours);
  return formatDelta(hoursToMinutes(hours));
}

/** Intl de-DE, z. B. formatDecimal(1.8) → "1,8" */
export function formatDecimal(value: number, digits = 1): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

/** 1800 → "1,8 s" */
export function formatSeconds(ms: number): string {
  return `${formatDecimal(ms / 1000, 1)} s`;
}

/** Date | ISO | "YYYY-MM-DD" → "Do 01.10." (Europe/Berlin) */
export function formatDateShort(value: Date | string): string {
  const key = dayKey(value);
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
  return `${WEEKDAYS_SHORT[weekday]} ${dayMonth(key)}`;
}

/** → "Donnerstag, 1. Oktober 2026" */
export function formatDateLong(value: Date | string): string {
  return longDateFormatter.format(new Date(`${dayKey(value)}T12:00:00Z`));
}

/** "2026-10" → "Oktober 2026" */
export function formatMonth(month: string): string {
  const match = MONTH_KEY.exec(month);
  if (!match) return month;
  return monthFormatter.format(new Date(`${month}-01T12:00:00Z`));
}

/** → "09.10.2026, 08:00" */
export function formatTimestamp(value: Date | string): string {
  const date = toDate(value);
  const key = berlinDateKey(date);
  return `${dayMonth(key)}${key.slice(0, 4)}, ${clock(date)}`;
}

/** → "vor 5 Min.", "vor 2 Std.", "gestern, 17:40", "05.10., 08:00" */
export function formatRelative(
  value: Date | string,
  now: Date = new Date(),
): string {
  const date = toDate(value);
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  const key = berlinDateKey(date);
  const todayKey = berlinDateKey(now);

  if (diffMinutes < 0) {
    // Zukunft (z. B. nächster Lauf)
    return key === todayKey
      ? `heute, ${clock(date)}`
      : `${dayMonth(key)}, ${clock(date)}`;
  }
  if (diffMinutes < 1) return "gerade eben";
  if (diffMinutes < 60) return `vor ${diffMinutes} Min.`;
  if (key === todayKey) return `vor ${Math.floor(diffMinutes / 60)} Std.`;
  if (key === shiftDateKey(todayKey, -1)) return `gestern, ${clock(date)}`;
  return `${dayMonth(key)}, ${clock(date)}`;
}

/** Start/Ende ISO → "08:50–09:05" (Berlin, Halbgeviertstrich) */
export function formatTimeRange(
  start: Date | string,
  end: Date | string,
): string {
  return `${clock(toDate(start))}–${clock(toDate(end))}`;
}
