import { berlinTodayKey, monthRange, shiftDateKey } from "@/lib/dates";

/** Laufender Monat "YYYY-MM" in Berlin. */
export function currentMonth(now: Date = new Date()): string {
  return berlinTodayKey(now).slice(0, 7);
}

/** "2026-10", -1 → "2026-09" */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Abschlussmonat: bis zum 10. der Vormonat, danach der laufende Monat. */
export function defaultCloseMonth(now: Date = new Date()): string {
  const today = berlinTodayKey(now);
  const day = Number(today.slice(8, 10));
  const month = today.slice(0, 7);
  return day <= 10 ? shiftMonth(month, -1) : month;
}

/**
 * Prüfbereich eines Monats: ab max(Monatsanfang, Erfassungsbeginn) bis
 * min(Monatsende, gestern). null, wenn der Bereich leer ist (z. B. am 1.
 * des Monats oder für Zukunftsmonate).
 */
export function closeRange(
  month: string,
  trackingStart: string | null,
  now: Date = new Date(),
): { startDate: string; endDate: string } | null {
  const { firstKey, lastKey } = monthRange(month);
  const yesterday = shiftDateKey(berlinTodayKey(now), -1);
  const startDate =
    trackingStart && trackingStart > firstKey ? trackingStart : firstKey;
  const endDate = yesterday < lastKey ? yesterday : lastKey;
  if (endDate < startDate) return null;
  return { startDate, endDate };
}
