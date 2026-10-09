// Reine Aufbereitung der Monatswerte für /overtime (Tabelle und Diagramm).

import { hoursToMinutes } from "@/lib/format";

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

export interface MonthValues {
  monthIndex: number;
  month: string;
  actualHours: number;
  targetHours: number;
  overtimeHours: number;
}

export type MonthRow<T extends MonthValues> =
  | { kind: "month"; month: T }
  | { kind: "collapsed"; months: T[]; label: string };

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/** "Feb – Jul" bzw. "Feb" */
export function monthRangeLabel(indices: number[]): string {
  if (indices.length === 0) return "";
  const first = MONTH_SHORT[indices[0]];
  const last = MONTH_SHORT[indices[indices.length - 1]];
  return indices.length === 1 ? first : `${first} – ${last}`;
}

/**
 * Monate vor dem Monat des Erfassungsbeginns mit Soll 0 und Ist 0 werden
 * zu zusammenhängenden Gruppen eingeklappt. Ohne Erfassungsbeginn bleibt
 * jeder Monat einzeln.
 */
export function groupMonths<T extends MonthValues>(
  months: T[],
  year: number,
  trackingStart: string | null,
): MonthRow<T>[] {
  const startMonth = trackingStart ? trackingStart.slice(0, 7) : null;
  const rows: MonthRow<T>[] = [];
  let run: T[] = [];

  const flush = () => {
    if (run.length === 0) return;
    rows.push({
      kind: "collapsed",
      months: run,
      label: monthRangeLabel(run.map((m) => m.monthIndex)),
    });
    run = [];
  };

  for (const month of months) {
    const isEmpty =
      hoursToMinutes(month.actualHours) === 0 &&
      hoursToMinutes(month.targetHours) === 0;
    const beforeStart =
      startMonth !== null && monthKey(year, month.monthIndex) < startMonth;
    if (isEmpty && beforeStart) {
      run.push(month);
    } else {
      flush();
      rows.push({ kind: "month", month });
    }
  }
  flush();
  return rows;
}

/**
 * Monate fürs Diagramm: ab dem Monat des Erfassungsbeginns; ohne
 * Erfassungsbeginn die Monate mit Ist > 0.
 */
export function chartMonths<T extends MonthValues>(
  months: T[],
  year: number,
  trackingStart: string | null,
): T[] {
  if (trackingStart) {
    const startMonth = trackingStart.slice(0, 7);
    return months.filter((m) => monthKey(year, m.monthIndex) >= startMonth);
  }
  return months.filter((m) => hoursToMinutes(m.actualHours) > 0);
}
