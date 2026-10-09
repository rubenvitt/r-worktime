// Serverseitig: lädt die Einträge eines Monats und baut die Stundenzettel-Antwort.

import { z } from "zod";
import {
  berlinDayStart,
  berlinTodayKey,
  monthRange,
  shiftDateKey,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
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

/** Einträge des Berlin-Monats (nach Start), gefiltert, in Eingabereihenfolge. */
export async function loadTimesheetEntries(
  userId: string,
  filter: TimesheetFilter,
): Promise<TimesheetSourceEntry[]> {
  const range = monthRange(filter.month);
  const types = filter.includeAbsences
    ? [...WORK_TYPES, ...ABSENCE_TYPES]
    : [...WORK_TYPES];

  // ±1 Tag Puffer: entscheidend ist der Berlin-Tag des Starts, nicht die date-Spalte
  const rows = await prisma.timeEntry.findMany({
    where: {
      userId,
      type: { in: types },
      source: { not: "ADJUSTMENT" },
      date: {
        gte: berlinDayStart(shiftDateKey(range.firstKey, -1)),
        lte: berlinDayStart(shiftDateKey(range.lastKey, 1)),
      },
    },
    select: {
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
    },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
  });

  return filterTimesheetEntries(
    rows.map((row) => ({ ...row, duration: row.duration.toNumber() })),
    filter,
  );
}

export async function loadAvailableRoots(userId: string): Promise<string[]> {
  const rows = await prisma.timeEntry.findMany({
    where: { userId, projectPath: { not: null } },
    select: { projectPath: true },
    distinct: ["projectPath"],
  });
  return expandProjectRoots(rows.map((row) => row.projectPath));
}

export function buildTimesheetResponse(
  entries: TimesheetSourceEntry[],
  query: ParsedTimesheetQuery,
  availableRoots: string[],
): TimesheetResponse {
  const { rounding } = query;
  const aggregated = aggregateTimesheet(entries.map(toTimesheetRecord), {
    dayBoundary: "Europe/Berlin",
  });
  const payload = buildTimesheetPayload(aggregated, rounding);
  const days = aggregated.map((day, index) => ({
    ...day,
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
