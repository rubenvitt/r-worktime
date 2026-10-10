// Reisetage: Vorschlag (Schlüsselwörter) + dauerhafte Festlegung → effektiver Reisetag.
// Reine Funktionen; dieselbe Regel gilt für Stundenzettel, Odoo-Payload und Bericht.
// Client-tauglich: keine Importe, die Prisma nachziehen (siehe travel-collect.ts).

import { z } from "zod";
import {
  dateKeyFromDbDate,
  isDateKey,
  monthRange,
  shiftDateKey,
  weekdayOfKey,
} from "@/lib/dates";
import { buildCsv, csvDate, csvHours } from "./csv";

/**
 * - suggested: Vorschlag, noch nicht bestätigt
 * - confirmed: Vorschlag bestätigt
 * - added: ohne Vorschlag manuell als Reisetag festgelegt
 * - rejected: Vorschlag abgelehnt
 * - none: kein Reisetag (mit oder ohne Festlegung)
 */
export type TravelStatus =
  | "suggested"
  | "confirmed"
  | "added"
  | "rejected"
  | "none";

export const TRAVEL_STATUS_LABELS: Record<TravelStatus, string> = {
  suggested: "Vorschlag",
  confirmed: "Bestätigt",
  added: "Manuell",
  rejected: "Abgelehnt",
  none: "Kein Reisetag",
};

export interface ResolvedTravel {
  isTravel: boolean;
  status: TravelStatus;
  /** true, wenn eine Festlegung gespeichert ist */
  hasOverride: boolean;
}

/** Festlegung vor Vorschlag. `override` null/undefined = keine Festlegung. */
export function resolveTravel(
  suggested: boolean,
  override: boolean | null | undefined,
): ResolvedTravel {
  if (override === null || override === undefined) {
    return {
      isTravel: suggested,
      status: suggested ? "suggested" : "none",
      hasOverride: false,
    };
  }
  let status: TravelStatus;
  if (override) status = suggested ? "confirmed" : "added";
  else status = suggested ? "rejected" : "none";
  return { isTravel: override, status, hasOverride: true };
}

export type TravelOverrides = Readonly<Record<string, boolean>>;

/** DB-Zeilen (@db.Date) → { "YYYY-MM-DD": isTravel } */
export function overridesFromRows(
  rows: Iterable<{ date: Date; isTravel: boolean }>,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const row of rows) result[dateKeyFromDbDate(row.date)] = row.isTravel;
  return result;
}

// ---------------------------------------------------------------------------
// Jahresbericht

export interface TravelReportDayInput {
  date: string;
  /** ungerundete Minuten aller Arbeitseinträge des Tages */
  minutes: number;
  /** nach Minuten absteigend */
  activities: { title: string; minutes: number }[];
  /** verschiedene Projektpfade des Tages, sortiert */
  projects: string[];
  /** Vorschlag aus den Schlüsselwörtern */
  suggested: boolean;
}

export interface TravelReportRow {
  date: string;
  /** 0 = Sonntag … 6 = Samstag */
  weekday: number;
  minutes: number;
  activities: string[];
  projects: string[];
  suggested: boolean;
  status: TravelStatus;
}

export interface TravelReportMonth {
  /** "YYYY-MM" */
  month: string;
  days: number;
  minutes: number;
}

export interface TravelReport {
  year: number;
  /** effektive Reisetage, aufsteigend */
  days: TravelReportRow[];
  /** abgelehnte Vorschläge, aufsteigend */
  rejected: TravelReportRow[];
  /** alle zwölf Monate */
  months: TravelReportMonth[];
  totals: {
    days: number;
    minutes: number;
    /** unbestätigte Vorschläge */
    open: number;
    confirmed: number;
    added: number;
    rejected: number;
  };
}

export function buildTravelReport(
  year: number,
  days: TravelReportDayInput[],
  overrides: TravelOverrides,
): TravelReport {
  const prefix = `${year}-`;
  const byDate = new Map(
    days.filter((d) => d.date.startsWith(prefix)).map((d) => [d.date, d]),
  );
  // Festlegungen ohne Einträge (z. B. reiner Reisetag) trotzdem zeigen
  for (const [date, isTravel] of Object.entries(overrides)) {
    if (isTravel && date.startsWith(prefix) && isDateKey(date)) {
      if (!byDate.has(date)) {
        byDate.set(date, {
          date,
          minutes: 0,
          activities: [],
          projects: [],
          suggested: false,
        });
      }
    }
  }

  const travelDays: TravelReportRow[] = [];
  const rejected: TravelReportRow[] = [];
  const sorted = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  for (const input of sorted) {
    const resolved = resolveTravel(input.suggested, overrides[input.date]);
    const row: TravelReportRow = {
      date: input.date,
      weekday: weekdayOfKey(input.date),
      minutes: input.minutes,
      activities: input.activities.map((a) => a.title),
      projects: input.projects,
      suggested: input.suggested,
      status: resolved.status,
    };
    if (resolved.isTravel) travelDays.push(row);
    else if (resolved.status === "rejected") rejected.push(row);
  }

  const months: TravelReportMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, "0")}`,
    days: 0,
    minutes: 0,
  }));
  for (const row of travelDays) {
    const bucket = months[Number(row.date.slice(5, 7)) - 1];
    bucket.days += 1;
    bucket.minutes += row.minutes;
  }

  const count = (status: TravelStatus) =>
    travelDays.filter((row) => row.status === status).length;

  return {
    year,
    days: travelDays,
    rejected,
    months,
    totals: {
      days: travelDays.length,
      minutes: travelDays.reduce((sum, row) => sum + row.minutes, 0),
      open: count("suggested"),
      confirmed: count("confirmed"),
      added: count("added"),
      rejected: rejected.length,
    },
  };
}

/**
 * Wendet eine Festlegung auf einen geladenen Bericht an (optimistisches
 * Update). `isTravel` null = Festlegung entfernt. Ein neu hinzugefügter Tag
 * ohne Zeile erscheint mit 0 Stunden, bis der Bericht neu geladen ist.
 */
export function applyDecisionToReport(
  report: TravelReport,
  decision: { date: string; isTravel: boolean | null },
): TravelReport {
  if (!decision.date.startsWith(`${report.year}-`)) return report;
  const rows = [...report.days, ...report.rejected];
  const overrides: Record<string, boolean> = {};
  for (const row of rows) {
    if (row.status === "confirmed" || row.status === "added") {
      overrides[row.date] = true;
    } else if (row.status === "rejected") {
      overrides[row.date] = false;
    }
  }
  if (decision.isTravel === null) delete overrides[decision.date];
  else overrides[decision.date] = decision.isTravel;

  const inputs: TravelReportDayInput[] = rows
    // manuelle Tage ohne Vorschlag tragen nur durch ihre Festlegung
    .filter((row) => row.suggested || overrides[row.date] === true)
    .map((row) => ({
      date: row.date,
      minutes: row.minutes,
      activities: row.activities.map((title) => ({ title, minutes: 0 })),
      projects: row.projects,
      suggested: row.suggested,
    }));
  return buildTravelReport(report.year, inputs, overrides);
}

// ---------------------------------------------------------------------------
// CSV (Excel-DE: Semikolon, Dezimalkomma, UTF-8 mit BOM)

const WEEKDAYS_LONG = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

export const TRAVEL_CSV_HEADER = [
  "Datum",
  "Wochentag",
  "Projekte",
  "Tätigkeiten",
  "Stunden",
  "Quelle",
];

export function buildTravelCsv(rows: TravelReportRow[]): string {
  return buildCsv([
    TRAVEL_CSV_HEADER,
    ...rows.map((row) => [
      csvDate(row.date),
      WEEKDAYS_LONG[row.weekday],
      row.projects.join(" | "),
      row.activities.join(" | "),
      csvHours(row.minutes),
      TRAVEL_STATUS_LABELS[row.status],
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Validierung für /api/travel-days

const dateKeySchema = z
  .string()
  .refine(isDateKey, "Datum im Format JJJJ-MM-TT erwartet");

export const travelDecisionSchema = z.object({
  date: dateKeySchema,
  isTravel: z.boolean(),
});

export type TravelDecision = z.infer<typeof travelDecisionSchema>;

export const travelImportSchema = z.object({
  decisions: z.array(travelDecisionSchema).max(5000),
});

const MAX_RANGE_DAYS = 366;

const rangeQuerySchema = z.object({
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Monat im Format JJJJ-MM erwartet")
    .optional(),
  year: z
    .string()
    .regex(/^\d{4}$/, "Jahr im Format JJJJ erwartet")
    .optional(),
});

export interface TravelRange {
  firstKey: string;
  lastKey: string;
}

/** Genau eine Angabe: from+to, month oder year. Zeitraum höchstens ein Jahr. */
export function parseTravelRangeQuery(
  params: URLSearchParams,
): { success: true; data: TravelRange } | { success: false; error: string } {
  const raw = Object.fromEntries(
    ["from", "to", "month", "year"]
      .map((key) => [key, params.get(key) ?? undefined] as const)
      .filter(([, value]) => value !== undefined && value !== ""),
  );
  const parsed = rangeQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Parameter",
    };
  }
  const { from, to, month, year } = parsed.data;
  const modes = [from !== undefined || to !== undefined, !!month, !!year];
  if (modes.filter(Boolean).length !== 1) {
    return {
      success: false,
      error: "Genau eine Angabe erwartet: from und to, month oder year",
    };
  }
  if (month) {
    const range = monthRange(month);
    return {
      success: true,
      data: { firstKey: range.firstKey, lastKey: range.lastKey },
    };
  }
  if (year) {
    return {
      success: true,
      data: { firstKey: `${year}-01-01`, lastKey: `${year}-12-31` },
    };
  }
  if (!from || !to) {
    return { success: false, error: "from und to werden beide gebraucht" };
  }
  if (to < from) {
    return { success: false, error: "to liegt vor from" };
  }
  if (to > shiftDateKey(from, MAX_RANGE_DAYS - 1)) {
    return { success: false, error: "Zeitraum höchstens ein Jahr" };
  }
  return { success: true, data: { firstKey: from, lastKey: to } };
}

export const travelYearSchema = z.coerce
  .number()
  .int()
  .min(2000, "Jahr ab 2000")
  .max(2100, "Jahr bis 2100");
