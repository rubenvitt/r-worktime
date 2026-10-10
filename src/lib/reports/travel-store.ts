// Serverseitig: Reisetag-Festlegungen (TravelDay) lesen und schreiben.

import { berlinDayStart } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { WORK_TYPES } from "@/lib/timesheet/entries";
import { loadSourceEntries } from "@/lib/timesheet/query";
import {
  buildTravelReport,
  overridesFromRows,
  type TravelDecision,
  type TravelRange,
  type TravelReport,
} from "./travel";
import { collectTravelDays } from "./travel-collect";

export interface TravelDayDto {
  date: string;
  isTravel: boolean;
  updatedAt: string;
}

export async function loadTravelOverrides(
  userId: string,
  range: TravelRange,
): Promise<Record<string, boolean>> {
  const rows = await prisma.travelDay.findMany({
    where: {
      userId,
      date: {
        gte: berlinDayStart(range.firstKey),
        lte: berlinDayStart(range.lastKey),
      },
    },
    select: { date: true, isTravel: true },
  });
  return overridesFromRows(rows);
}

export async function listTravelDays(
  userId: string,
  range: TravelRange,
): Promise<TravelDayDto[]> {
  const rows = await prisma.travelDay.findMany({
    where: {
      userId,
      date: {
        gte: berlinDayStart(range.firstKey),
        lte: berlinDayStart(range.lastKey),
      },
    },
    select: { date: true, isTravel: true, updatedAt: true },
    orderBy: { date: "asc" },
  });
  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    isTravel: row.isTravel,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function upsertTravelDay(
  userId: string,
  decision: TravelDecision,
): Promise<TravelDayDto> {
  const date = berlinDayStart(decision.date);
  const row = await prisma.travelDay.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, isTravel: decision.isTravel },
    update: { isTravel: decision.isTravel },
    select: { date: true, isTravel: true, updatedAt: true },
  });
  return {
    date: decision.date,
    isTravel: row.isTravel,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Löscht die Festlegung; danach gilt wieder der Vorschlag. */
export async function deleteTravelDay(
  userId: string,
  dateKey: string,
): Promise<number> {
  const result = await prisma.travelDay.deleteMany({
    where: { userId, date: berlinDayStart(dateKey) },
  });
  return result.count;
}

/** Legt nur Tage an, für die noch keine Festlegung existiert. */
export async function importTravelDays(
  userId: string,
  decisions: TravelDecision[],
): Promise<number> {
  if (decisions.length === 0) return 0;
  const result = await prisma.travelDay.createMany({
    data: decisions.map((decision) => ({
      userId,
      date: berlinDayStart(decision.date),
      isTravel: decision.isTravel,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function loadTravelReport(
  userId: string,
  year: number,
): Promise<TravelReport> {
  const range = { firstKey: `${year}-01-01`, lastKey: `${year}-12-31` };
  const [entries, overrides] = await Promise.all([
    loadSourceEntries(userId, range.firstKey, range.lastKey, WORK_TYPES),
    loadTravelOverrides(userId, range),
  ]);
  return buildTravelReport(year, collectTravelDays(entries, year), overrides);
}
