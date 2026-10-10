import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    userSettings: { findUnique: vi.fn() },
    timeEntry: { findMany: vi.fn(), findFirst: vi.fn() },
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

describe("calculateMonthlyStatistics (Abrechnungsstatus)", () => {
  beforeEach(() => {
    overtimeService.invalidateCache("u1");
    prismaMock.userSettings.findUnique.mockResolvedValue({
      weeklyWorkHours: new Prisma.Decimal(40),
      workDays: [1, 2, 3, 4, 5],
    });
    prismaMock.timeEntry.findMany.mockReset();
  });

  it("teilt Arbeitsstunden nach Timing-Status statt nach Typ", async () => {
    const withStatus = (
      dateKey: string,
      hours: number,
      billingStatus: string | null,
      type = "WORK",
      source = "TIMING_SYNC",
    ) => ({
      ...entry(dateKey, hours, type),
      billingStatus,
      source,
      description: null,
    });
    prismaMock.timeEntry.findMany.mockResolvedValue([
      withStatus("2026-10-01", 4, "billable"),
      withStatus("2026-10-01", 1, "paid"),
      withStatus("2026-10-02", 2, "not_billable"),
      withStatus("2026-10-02", 1.5, null),
      withStatus("2026-10-05", 8, null, "WORK", "BULK_FILL"),
      // Abwesenheit mit Status zählt nicht als abrechenbar
      withStatus("2026-10-06", 8, "unbilled", "VACATION"),
      // Anfangssaldo zählt nicht
      withStatus("2026-10-01", 12.5, null, "OVERTIME", "ADJUSTMENT"),
    ]);

    const stats = await overtimeService.calculateMonthlyStatistics(
      "u1",
      2026,
      10,
    );

    expect(stats.billableHours).toBe(5);
    expect(stats.nonBillableHours).toBe(2);
    expect(stats.unknownHours).toBe(9.5);
  });
});

describe("calculateBalance (Anfangssaldo)", () => {
  // Datenbank-Filter nachbilden: nur Einträge im angefragten Zeitraum
  function serveEntries(rows: ReturnType<typeof entry>[]) {
    prismaMock.timeEntry.findMany.mockImplementation(
      async ({ where }: { where: { date: { gte: Date; lte: Date } } }) =>
        rows.filter(
          (row) => row.date >= where.date.gte && row.date <= where.date.lte,
        ),
    );
  }

  beforeEach(() => {
    overtimeService.invalidateCache("u1");
    prismaMock.userSettings.findUnique.mockResolvedValue({
      weeklyWorkHours: new Prisma.Decimal(40),
      workDays: [1, 2, 3, 4, 5],
    });
    prismaMock.timeEntry.findMany.mockReset();
    prismaMock.timeEntry.findFirst.mockReset();
    // Anfangssaldo +12,5 h am Fr 31.07.2026
    prismaMock.timeEntry.findFirst.mockResolvedValue({
      ...entry("2026-07-31", 12.5, "OVERTIME"),
      source: "ADJUSTMENT",
    });
  });

  it("zählt Arbeit am Tag des Anfangssaldos nicht noch einmal", async () => {
    serveEntries([
      // per Timing-Sync importiert, aber schon im Anfangssaldo enthalten
      entry("2026-07-31", 8),
      entry("2026-08-03", 8),
    ]);

    const balance = await overtimeService.calculateBalance({
      userId: "u1",
      endDate: new Date("2026-08-03T00:00:00.000Z"),
    });

    // Soll ab Sa 01.08.: nur Mo 03.08. mit 8 h → 12,5 + 8 − 8
    expect(balance.balance).toBe(12.5);
    const where = prismaMock.timeEntry.findMany.mock.calls[0][0].where;
    expect(where.date.gte.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("beginnt auch nach der Zeitumstellung am Folgetag um Mitternacht", async () => {
    // Anfangssaldo am Sa 24.10.2026, in der Nacht danach endet die Sommerzeit
    prismaMock.timeEntry.findFirst.mockResolvedValue({
      ...entry("2026-10-24", 0, "OVERTIME"),
      source: "ADJUSTMENT",
    });
    serveEntries([entry("2026-10-25", 3)]);

    const balance = await overtimeService.calculateBalance({
      userId: "u1",
      endDate: new Date("2026-10-25T00:00:00.000Z"),
    });

    // So 25.10. ohne Soll, 3 h Arbeit zählen
    expect(balance.balance).toBe(3);
  });
});
