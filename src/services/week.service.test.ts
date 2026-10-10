import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, officialHolidaysMock } = vi.hoisted(() => ({
  prismaMock: {
    userSettings: { findUnique: vi.fn() },
    timeEntry: { findMany: vi.fn() },
  },
  officialHolidaysMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/reports/forecast-data", () => ({
  loadOfficialHolidays: officialHolidaysMock,
}));

import { weekService } from "./week.service";

function entry(dateKey: string, hours: number, type = "WORK") {
  return {
    id: `${dateKey}-${type}`,
    date: new Date(`${dateKey}T00:00:00.000Z`),
    startTime: new Date(`${dateKey}T08:00:00.000Z`),
    endTime: new Date(`${dateKey}T16:00:00.000Z`),
    duration: new Prisma.Decimal(hours),
    type,
    description: null,
  };
}

describe("getWeekData (KW 53/2026 mit Neujahr)", () => {
  beforeEach(() => {
    prismaMock.userSettings.findUnique.mockResolvedValue({
      weeklyWorkHours: new Prisma.Decimal(40),
      workDays: [1, 2, 3, 4, 5],
    });
    prismaMock.timeEntry.findMany.mockReset();
    officialHolidaysMock.mockReset();
    officialHolidaysMock.mockResolvedValue({
      names: { "2026-12-25": "1. Weihnachtstag", "2027-01-01": "Neujahr" },
      unavailableYears: [],
    });
  });

  it("nimmt importierte Feiertage aus dem Soll und markiert sie", async () => {
    prismaMock.timeEntry.findMany.mockResolvedValue([
      entry("2027-01-01", 8, "HOLIDAY"),
    ]);
    const week = await weekService.getWeekData("u1", 2026, 53);

    expect(officialHolidaysMock).toHaveBeenCalledWith([2026, 2027]);
    const newYear = week.days[4];
    expect(newYear.targetHours).toBe(0);
    expect(newYear.holiday).toEqual({ name: "Neujahr", imported: true });
    expect(week.summary.targetHours).toBe(32);
  });

  it("markiert nicht importierte Feiertage, das Soll bleibt wie im Saldo", async () => {
    prismaMock.timeEntry.findMany.mockResolvedValue([]);
    const week = await weekService.getWeekData("u1", 2026, 53);

    const newYear = week.days[4];
    expect(newYear.targetHours).toBe(8);
    expect(newYear.holiday).toEqual({ name: "Neujahr", imported: false });
    expect(week.days[0].holiday).toBeNull();
    expect(week.summary.targetHours).toBe(40);
  });

  it("rechnet das Soll nach den eingestellten Arbeitstagen", async () => {
    prismaMock.userSettings.findUnique.mockResolvedValue({
      weeklyWorkHours: new Prisma.Decimal(32),
      workDays: [1, 2, 3, 4],
    });
    prismaMock.timeEntry.findMany.mockResolvedValue([]);
    const week = await weekService.getWeekData("u1", 2026, 53);

    expect(week.days.map((d) => d.targetHours)).toEqual([8, 8, 8, 8, 0, 0, 0]);
    expect(week.summary.targetHours).toBe(32);
  });

  it("funktioniert ohne Feiertags-Dienst", async () => {
    officialHolidaysMock.mockResolvedValue({
      names: {},
      unavailableYears: [2026, 2027],
    });
    prismaMock.timeEntry.findMany.mockResolvedValue([]);
    const week = await weekService.getWeekData("u1", 2026, 53);

    expect(week.days.every((d) => d.holiday === null)).toBe(true);
    expect(week.summary.targetHours).toBe(40);
  });
});
