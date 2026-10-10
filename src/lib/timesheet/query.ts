// Serverseitig: lädt die Einträge eines Monats und baut die Stundenzettel-Antwort.

import type { EntryType } from "@prisma/client";
import { z } from "zod";
import {
  berlinDayStart,
  berlinTodayKey,
  monthRange,
  shiftDateKey,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import type { TravelOverrides } from "@/lib/reports/travel";
import {
  aggregateTimesheet,
  buildTimesheetPayload,
  DEFAULT_ROUNDING,
  formatClock,
  formatMinutes,
  isRounding,
  type Rounding,
} from "./aggregate";
import {
  ABSENCE_TYPES,
  expandProjectRoots,
  filterTimesheetEntries,
  type TimesheetFilter,
  type TimesheetSourceEntry,
  toTimesheetRecord,
  WORK_TYPES,
} from "./entries";
import type { TimesheetResponse } from "./types";

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Monat im Format JJJJ-MM erwartet");

export const timesheetQuerySchema = z.object({
  month: monthSchema.optional(),
  root: z.string().trim().max(500).optional(),
  rounding: z.coerce
    .number()
    .int()
    .refine(isRounding, "Rundung muss 5, 10, 15, 30 oder 60 sein")
    .optional(),
  includeAbsences: z.enum(["0", "1", "true", "false"]).optional(),
});

export interface ParsedTimesheetQuery extends TimesheetFilter {
  rounding: Rounding;
}

export function parseTimesheetQuery(
  params: URLSearchParams,
):
  | { success: true; data: ParsedTimesheetQuery }
  | { success: false; error: string } {
  const raw = Object.fromEntries(
    ["month", "root", "rounding", "includeAbsences"]
      .map((key) => [key, params.get(key) ?? undefined] as const)
      .filter(([, value]) => value !== undefined && value !== ""),
  );
  const parsed = timesheetQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Parameter",
    };
  }
  const { month, root, rounding, includeAbsences } = parsed.data;
  return {
    success: true,
    data: {
      month: month ?? berlinTodayKey().slice(0, 7),
      root: root ? root : null,
      rounding: (rounding as Rounding | undefined) ?? DEFAULT_ROUNDING,
      includeAbsences: includeAbsences === "1" || includeAbsences === "true",
    },
  };
}

const SOURCE_ENTRY_SELECT = {
  id: true,
  startTime: true,
  endTime: true,
  type: true,
  source: true,
  title: true,
  notes: true,
  description: true,
  projectPath: true,
  billingStatus: true,
  duration: true,
} as const;

/**
 * Rohzeilen der Typen `types` mit Berliner Starttag zwischen firstKey und
 * lastKey – ungefiltert, mit ±1 Tag Puffer auf der date-Spalte; entscheidend
 * ist der Berlin-Tag des Starts, den die Aufrufer selbst filtern.
 */
export async function loadSourceEntries(
  userId: string,
  firstKey: string,
  lastKey: string,
  types: readonly string[],
): Promise<TimesheetSourceEntry[]> {
  const rows = await prisma.timeEntry.findMany({
    where: {
      userId,
      type: { in: [...types] as EntryType[] },
      source: { not: "ADJUSTMENT" },
      date: {
        gte: berlinDayStart(shiftDateKey(firstKey, -1)),
        lte: berlinDayStart(shiftDateKey(lastKey, 1)),
      },
    },
    select: SOURCE_ENTRY_SELECT,
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({ ...row, duration: row.duration.toNumber() }));
}

/** Einträge des Berlin-Monats (nach Start), gefiltert, in Eingabereihenfolge. */
export async function loadTimesheetEntries(
  userId: string,
  filter: TimesheetFilter,
): Promise<TimesheetSourceEntry[]> {
  const range = monthRange(filter.month);
  const types = filter.includeAbsences
    ? [...WORK_TYPES, ...ABSENCE_TYPES]
    : [...WORK_TYPES];
  const rows = await loadSourceEntries(
    userId,
    range.firstKey,
    range.lastKey,
    types,
  );
  return filterTimesheetEntries(rows, filter);
}

export async function loadAvailableRoots(userId: string): Promise<string[]> {
  const rows = await prisma.timeEntry.findMany({
    where: { userId, projectPath: { not: null } },
    select: { projectPath: true },
    distinct: ["projectPath"],
  });
  return expandProjectRoots(rows.map((row) => row.projectPath));
}

/**
 * `travelOverrides`: gespeicherte Reisetag-Festlegungen des Monats. Der
 * Payload trägt den effektiven Wert (Festlegung, sonst Vorschlag); die Tage
 * behalten in `travelFee` den Vorschlag und bekommen `travelOverride` dazu.
 */
export function buildTimesheetResponse(
  entries: TimesheetSourceEntry[],
  query: ParsedTimesheetQuery,
  availableRoots: string[],
  travelOverrides: TravelOverrides = {},
): TimesheetResponse {
  const { rounding } = query;
  const aggregated = aggregateTimesheet(entries.map(toTimesheetRecord), {
    dayBoundary: "Europe/Berlin",
  });
  const payload = buildTimesheetPayload(aggregated, rounding, travelOverrides);
  const days = aggregated.map((day, index) => ({
    ...day,
    travelOverride: travelOverrides[day.date] ?? null,
    activities: day.activities.map((activity) => ({
      ...activity,
      hours: formatMinutes(activity.minutes, rounding),
    })),
    hours: payload[index].hours,
    text: payload[index].text,
  }));

  const minutes = aggregated.reduce((sum, day) => sum + day.minutes, 0);
  const roundedMinutes = aggregated.reduce(
    (sum, day) => sum + Math.round(day.minutes / rounding) * rounding,
    0,
  );

  return {
    month: query.month,
    root: query.root,
    rounding,
    includeAbsences: query.includeAbsences,
    days,
    payload,
    totals: {
      minutes,
      roundedMinutes,
      hours: formatClock(roundedMinutes),
      days: days.length,
      entries: entries.length,
    },
    availableRoots,
  };
}
