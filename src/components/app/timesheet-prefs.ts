// Gespeicherte Stundenzettel-Einstellungen (localStorage), geteilt zwischen
// Stundenzettel und Monatsabschluss. Logik unverändert aus timesheet-view.

import {
  DEFAULT_ROUNDING,
  isRounding,
  type Rounding,
} from "@/lib/timesheet/aggregate";

export interface TimesheetPrefs {
  root: string | null;
  rounding: Rounding;
  includeAbsences: boolean;
}

export const TIMESHEET_PREFS_KEY = "rwt.timesheet.prefs";

export const DEFAULT_TIMESHEET_PREFS: TimesheetPrefs = {
  root: null,
  rounding: DEFAULT_ROUNDING,
  includeAbsences: false,
};

/** Liest die Einstellungen; SSR-sicher, fällt bei Fehlern auf Defaults zurück. */
export function loadTimesheetPrefs(): TimesheetPrefs {
  let stored: Partial<TimesheetPrefs> | null = null;
  try {
    const raw =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(TIMESHEET_PREFS_KEY);
    stored = raw ? (JSON.parse(raw) as Partial<TimesheetPrefs>) : null;
  } catch {
    stored = null;
  }
  return {
    root: typeof stored?.root === "string" ? stored.root : null,
    rounding:
      typeof stored?.rounding === "number" && isRounding(stored.rounding)
        ? stored.rounding
        : DEFAULT_ROUNDING,
    includeAbsences: stored?.includeAbsences === true,
  };
}

export function saveTimesheetPrefs(prefs: TimesheetPrefs): void {
  try {
    window.localStorage.setItem(TIMESHEET_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Speicher nicht verfügbar – Einstellung gilt dann nur für diese Sitzung
  }
}

/** Query-String für /api/timesheet (identisch zu buildQuery im Stundenzettel). */
export function timesheetQueryString(
  month: string,
  prefs: TimesheetPrefs,
  withRounding = true,
): string {
  const params = new URLSearchParams({ month });
  if (prefs.root) params.set("root", prefs.root);
  if (withRounding) params.set("rounding", String(prefs.rounding));
  if (prefs.includeAbsences) params.set("includeAbsences", "1");
  return params.toString();
}
