// Beschriftungen und Formate für „Jahr & Prognose“ (rein, ohne React).

import { MONTH_SHORT } from "@/components/overview/overtime-utils";
import { formatDecimal } from "@/lib/format";
import type { PeriodStatus } from "@/lib/reports/year";

/** "2026-10" → "Okt" */
export function monthShort(month: string): string {
  return MONTH_SHORT[Number(month.slice(5, 7)) - 1] ?? month;
}

/** "2027-01" → "Jan 27"; im Bezugsjahr nur "Jan" */
export function monthShortWithYear(month: string, referenceYear: number) {
  const short = monthShort(month);
  return Number(month.slice(0, 4)) === referenceYear
    ? short
    : `${short} ${month.slice(2, 4)}`;
}

/** "2026-10" → "Okt 2026" */
export function monthLabel(month: string): string {
  return `${monthShort(month)} ${month.slice(0, 4)}`;
}

/** Quartal 3 → "Jul–Sep" */
export function quarterMonths(quarter: number): string {
  const first = (quarter - 1) * 3;
  return `${MONTH_SHORT[first]}–${MONTH_SHORT[first + 2]}`;
}

/** 1 → "1 Tag", 2,5 → "2,5 Tage" */
export function formatDayCount(days: number): string {
  return `${formatDecimal(days, 1)} ${days === 1 ? "Tag" : "Tage"}`;
}

/** "2026-12-25" → "25.12." */
export function formatDayMonth(key: string): string {
  return `${key.slice(8, 10)}.${key.slice(5, 7)}.`;
}

export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
  untracked: "nicht erfasst",
  closed: "abgeschlossen",
  current: "läuft",
  future: "ausstehend",
};

const TICK_STEPS = [60, 120, 180, 300, 600, 900, 1200, 1800, 3000, 6000];

/** Runde Achsenwerte in ganzen Stunden, die 0 enthalten (Minuten). */
export function niceTicks(min: number, max: number, target = 4): number[] {
  const span = Math.max(max - min, 60);
  const step =
    TICK_STEPS.find((candidate) => span / candidate <= target) ??
    Math.ceil(span / target / 6000) * 6000;
  const low = Math.floor(min / step) * step;
  const high = Math.max(Math.ceil(max / step) * step, low + step);
  const ticks: number[] = [];
  for (let value = low; value <= high; value += step) ticks.push(value);
  return ticks;
}
