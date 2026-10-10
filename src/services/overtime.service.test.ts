import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, officialHolidaysMock } = vi.hoisted(() => ({
  prismaMock: {
    userSettings: { findUnique: vi.fn() },
    timeEntry: { findMany: vi.fn(), findFirst: vi.fn() },
  },
  officialHolidaysMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/services/holiday.service", () => ({
  loadOfficialHolidays: officialHolidaysMock,
}));

beforeEach(() => {
  officialHolidaysMock.mockReset();
  officialHolidaysMock.mockResolvedValue({ names: {}, unavailableYears: [] });
});

import { overtimeService } from "./overtime.service";

function entry(dateKey: string, hours: number, type = "WORK") {
  return {
    date: new Date(`${dateKey}T00:00:00.000Z`),
    duration: new Prisma.Decimal(hours),
    type,
    source: "TIMING_SYNC",
  };
}

// Datenbank-Filter nachbilden: nur Einträge im angefragten Zeitraum
function serveEntries(rows: ReturnType<typeof entry>[]) {
  prismaMock.timeEntry.findMany.mockImplementation(
    async ({ where }: { where: { date: { gte: Date; lte: Date } } }) =>
      rows.filter(
        (row) => row.date >= where.date.gte && row.date <= where.date.lte,
      ),
  );
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

describe("calculateBalance (Urlaub/Krank je Tag, Feiertage)", () => {
  // Mo 30.03. bis Fr 03.04.2026, Karfreitag ist offizieller Feiertag
  const week = { from: "2026-03-30", to: "2026-04-03" };
  const balanceOf = async (rows: ReturnType<typeof entry>[]) => {
    serveEntries(rows);
    return overtimeService.calculateBalance({
      userId: "u1",
      startDate: new Date(`${week.from}T00:00:00.000Z`),
      endDate: new Date(`${week.to}T00:00:00.000Z`),
    });
  };
  const monToThu = (hours = 8) =>
    ["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02"].map((key) =>
      entry(key, hours),
    );

  beforeEach(() => {
    overtimeService.invalidateCache("u1");
    prismaMock.userSettings.findUnique.mockResolvedValue({
      weeklyWorkHours: new Prisma.Decimal(40),
      workDays: [1, 2, 3, 4, 5],
    });
    prismaMock.timeEntry.findMany.mockReset();
    prismaMock.timeEntry.findFirst.mockReset();
    prismaMock.timeEntry.findFirst.mockResolvedValue(null);
    officialHolidaysMock.mockResolvedValue({
      names: { "2026-04-03": "Karfreitag" },
      unavailableYears: [],
    });
  });

  it("nimmt offizielle Feiertage auch ohne Import aus dem Soll", async () => {
    const balance = await balanceOf(monToThu());
    expect(officialHolidaysMock).toHaveBeenCalledWith([2026]);
    expect(balance.details?.targetHours).toBe(32);
    expect(balance.balance).toBe(0);
  });

  it("zählt einen importierten Feiertag nicht doppelt", async () => {
    const balance = await balanceOf([
      ...monToThu(),
      entry("2026-04-03", 8, "HOLIDAY"),
    ]);
    expect(balance.details?.targetHours).toBe(32);
    expect(balance.details?.actualHours).toBe(32);
    expect(balance.balance).toBe(0);
  });

  it("fällt ohne Feiertags-Dienst auf importierte Feiertage zurück", async () => {
    officialHolidaysMock.mockResolvedValue({
      names: {},
      unavailableYears: [2026],
    });
    expect(
      (await balanceOf([...monToThu(), entry("2026-04-03", 8, "HOLIDAY")]))
        .balance,
    ).toBe(0);
    overtimeService.invalidateCache("u1");
    expect((await balanceOf(monToThu())).balance).toBe(-8);
  });

  it("schreibt einen halben Urlaubstag nur mit seinen Stunden gut", async () => {
    const balance = await balanceOf([
      entry("2026-03-30", 4, "VACATION"),
      entry("2026-03-30", 4),
      entry("2026-03-31", 8),
      entry("2026-04-01", 8),
      entry("2026-04-02", 8),
    ]);
    expect(balance.balance).toBe(0);
  });

  it("schreibt zwei Abwesenheiten am selben Tag höchstens einmal gut", async () => {
    const balance = await balanceOf([
      entry("2026-03-30", 8, "VACATION"),
      entry("2026-03-30", 8, "SICK"),
      entry("2026-03-31", 8),
      entry("2026-04-01", 8),
      entry("2026-04-02", 8),
    ]);
    expect(balance.details?.actualHours).toBe(32);
    expect(balance.balance).toBe(0);
  });

  it("schreibt Urlaub an Feiertagen und freien Tagen nicht gut", async () => {
    const balance = await balanceOf([
      ...monToThu(),
      entry("2026-04-03", 8, "VACATION"),
      entry("2026-04-04", 8, "VACATION"),
    ]);
    expect(balance.details?.actualHours).toBe(32);
    expect(balance.balance).toBe(0);
  });

  it("wertet einen 0-h-Urlaubseintrag nicht als ganzen Tag", async () => {
    const balance = await balanceOf([
      entry("2026-03-30", 0, "VACATION"),
      entry("2026-03-31", 8),
      entry("2026-04-01", 8),
      entry("2026-04-02", 8),
    ]);
    expect(balance.balance).toBe(-8);
  });

  it("rechnet das Soll auf Berliner Kalendertagen, unabhängig von der Serverzeit", async () => {
    // Nur Mo 30.03.: in America/Los_Angeles wäre 00:00Z noch Sonntag
    serveEntries([]);
    const balance = await overtimeService.calculateBalance({
      userId: "u1",
      startDate: new Date("2026-03-30T00:00:00.000Z"),
      endDate: new Date("2026-03-30T00:00:00.000Z"),
    });
    expect(balance.details?.targetHours).toBe(8);
    expect(balance.balance).toBe(-8);
  });
});

describe("calculateWeeklyStatistics (Urlaub je Tag, offizielle Feiertage)", () => {
  beforeEach(() => {
    overtimeService.invalidateCache("u1");
    prismaMock.userSettings.findUnique.mockResolvedValue({
      weeklyWorkHours: new Prisma.Decimal(40),
      workDays: [1, 2, 3, 4, 5],
    });
    prismaMock.timeEntry.findMany.mockReset();
    officialHolidaysMock.mockResolvedValue({
      names: { "2026-04-03": "Karfreitag" },
      unavailableYears: [],
    });
  });

  it("nimmt offizielle Feiertage aus dem Soll und behält Arbeit neben halbem Urlaub", async () => {
    prismaMock.timeEntry.findMany.mockResolvedValue([
      entry("2026-03-30", 4),
      entry("2026-03-30", 4, "VACATION"),
      entry("2026-03-31", 8, "VACATION"),
      entry("2026-03-31", 8, "VACATION"),
    ]);
    const stats = await overtimeService.calculateWeeklyStatistics(
      "u1",
      2026,
      14,
    );
    const [mon, tue, , , fri] = stats.dailyBreakdown;
    expect(mon.actualHours).toBe(8);
    expect(tue.actualHours).toBe(8);
    expect(fri.targetHours).toBe(0);
    expect(fri.entryType).toBe("HOLIDAY");
    expect(stats.targetHours).toBe(32);
  });
});

describe("calculateMonthlyStatistics (Soll)", () => {
  beforeEach(() => {
    overtimeService.invalidateCache("u1");
    prismaMock.userSettings.findUnique.mockResolvedValue({
      weeklyWorkHours: new Prisma.Decimal(40),
      workDays: [1, 2, 3, 4, 5],
    });
    prismaMock.timeEntry.findMany.mockReset();
    officialHolidaysMock.mockResolvedValue({
      names: { "2026-04-03": "Karfreitag", "2026-04-06": "Ostermontag" },
      unavailableYears: [],
    });
  });

  it("mindert das Soll um Feiertage und zählt Feiertags-Einträge nicht als Ist", async () => {
    prismaMock.timeEntry.findMany.mockResolvedValue([
      { ...entry("2026-04-03", 8, "HOLIDAY"), billingStatus: null },
      { ...entry("2026-04-07", 8), billingStatus: null },
    ]);
    const stats = await overtimeService.calculateMonthlyStatistics(
      "u1",
      2026,
      4,
    );
    // April 2026: 22 Arbeitstage, davon 2 Feiertage
    expect(stats.targetHours).toBe(160);
    expect(stats.totalHours).toBe(8);
  });
});
