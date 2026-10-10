import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    userSettings: { findUnique: vi.fn() },
    timeEntry: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { overtimeService } from "./overtime.service";

function entry(dateKey: string, hours: number, type = "WORK") {
  return {
    date: new Date(`${dateKey}T00:00:00.000Z`),
    duration: new Prisma.Decimal(hours),
    type,
  };
}

describe("calculateWeeklyStatistics (ISO-8601)", () => {
  beforeEach(() => {
    overtimeService.invalidateCache("u1");
    prismaMock.userSettings.findUnique.mockResolvedValue({
      weeklyWorkHours: new Prisma.Decimal(40),
      workDays: [1, 2, 3, 4, 5],
    });
    prismaMock.timeEntry.findMany.mockReset();
  });

  it("fragt KW 53/2026 von Mo 28.12.2026 bis So 03.01.2027 ab", async () => {
    prismaMock.timeEntry.findMany.mockResolvedValue([
      entry("2026-12-28", 8),
      entry("2027-01-01", 0, "HOLIDAY"),
    ]);

    const stats = await overtimeService.calculateWeeklyStatistics(
      "u1",
      2026,
      53,
    );

    const where = prismaMock.timeEntry.findMany.mock.calls[0][0].where;
    expect(where.date.gte.toISOString()).toBe("2026-12-28T00:00:00.000Z");
    expect(where.date.lte.toISOString()).toBe("2027-01-03T00:00:00.000Z");
    expect(
      stats.dailyBreakdown.map((d) => d.date.toISOString().slice(0, 10)),
    ).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    // Mo–Do Soll, Fr Feiertag (Soll 0), Wochenende 0
    expect(stats.targetHours).toBe(32);
    expect(stats.totalHours).toBe(8);
  });

  it("beginnt KW 1/2026 im Vorjahr (Mo 29.12.2025)", async () => {
    prismaMock.timeEntry.findMany.mockResolvedValue([]);

    const stats = await overtimeService.calculateWeeklyStatistics(
      "u1",
      2026,
      1,
    );

    const where = prismaMock.timeEntry.findMany.mock.calls[0][0].where;
    expect(where.date.gte.toISOString()).toBe("2025-12-29T00:00:00.000Z");
    expect(where.date.lte.toISOString()).toBe("2026-01-04T00:00:00.000Z");
    expect(stats.targetHours).toBe(40);
  });

  it("lehnt KW 53 in Jahren mit 52 Wochen ab", async () => {
    await expect(
      overtimeService.calculateWeeklyStatistics("u1", 2027, 53),
    ).rejects.toThrow(RangeError);
  });
});
