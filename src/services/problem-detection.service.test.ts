import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, officialHolidaysMock } = vi.hoisted(() => ({
  prismaMock: {
    userSettings: { findUnique: vi.fn() },
    timeEntry: { findMany: vi.fn() },
    reviewedDay: { findMany: vi.fn() },
  },
  officialHolidaysMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/services/holiday.service", () => ({
  loadOfficialHolidays: officialHolidaysMock,
}));

import { ProblemDetectionService } from "./problem-detection.service";

function entry(dateKey: string, hours: number, type = "WORK") {
  return {
    id: `${dateKey}-${type}-${hours}`,
    userId: "u1",
    date: new Date(`${dateKey}T00:00:00.000Z`),
    duration: new Prisma.Decimal(hours),
    type,
  };
}

// Mo 30.03. bis Mo 06.04.2026; Karfreitag (03.04.) und Ostermontag (06.04.)
const range = {
  startDate: new Date("2026-03-30T00:00:00.000Z"),
  endDate: new Date("2026-04-06T00:00:00.000Z"),
};

async function problemsFor(rows: ReturnType<typeof entry>[]) {
  prismaMock.timeEntry.findMany.mockResolvedValue(rows);
  const service = new ProblemDetectionService();
  const result = await service.findProblematicDays("u1", {
    dateRange: range,
    problemType: "all",
    reviewStatus: "unreviewed",
    sortBy: "date_asc",
  });
  return {
    ...result,
    byKey: new Map(
      result.problems.map((p) => [p.date.toISOString().slice(0, 10), p]),
    ),
  };
}

describe("findProblematicDays (Feiertage)", () => {
  beforeEach(() => {
    prismaMock.userSettings.findUnique.mockResolvedValue({
      weeklyWorkHours: new Prisma.Decimal(40),
      workDays: [1, 2, 3, 4, 5],
    });
    prismaMock.reviewedDay.findMany.mockResolvedValue([]);
    prismaMock.timeEntry.findMany.mockReset();
    officialHolidaysMock.mockReset();
    officialHolidaysMock.mockResolvedValue({
      names: { "2026-04-03": "Karfreitag", "2026-04-06": "Ostermontag" },
      unavailableYears: [],
    });
  });

  it("meldet offizielle Feiertage ohne Import nicht als fehlend", async () => {
    const { byKey, stats } = await problemsFor([
      entry("2026-03-30", 8),
      entry("2026-03-31", 8),
      entry("2026-04-01", 8),
    ]);
    expect(officialHolidaysMock).toHaveBeenCalledWith([2026]);
    // Do 02.04. fehlt, Fr und Mo sind Feiertage, das Wochenende ist frei
    expect([...byKey.keys()]).toEqual(["2026-04-02"]);
    expect(byKey.get("2026-04-02")?.type).toBe("missing");
    expect(stats.missingDays).toBe(1);
  });

  it("meldet einen Feiertag mit 0-h-Eintrag oder kurzer Arbeit nicht", async () => {
    const { byKey } = await problemsFor([
      entry("2026-03-30", 8),
      entry("2026-03-31", 8),
      entry("2026-04-01", 8),
      entry("2026-04-02", 8),
      entry("2026-04-03", 0, "HOLIDAY"),
      entry("2026-04-06", 2),
    ]);
    expect(byKey.size).toBe(0);
  });

  it("erkennt importierte Feiertage auch ohne Feiertags-Dienst", async () => {
    officialHolidaysMock.mockResolvedValue({
      names: {},
      unavailableYears: [2026],
    });
    const { byKey } = await problemsFor([
      entry("2026-03-30", 8),
      entry("2026-03-31", 8),
      entry("2026-04-01", 8),
      entry("2026-04-02", 8),
      entry("2026-04-03", 0, "HOLIDAY"),
    ]);
    // Ostermontag ist ohne Dienst und ohne Import unbekannt
    expect([...byKey.keys()]).toEqual(["2026-04-06"]);
    expect(byKey.get("2026-04-06")?.isHoliday).toBe(false);
  });

  it("ordnet Einträge über den Berliner Kalendertag zu", async () => {
    const { byKey } = await problemsFor([
      entry("2026-03-30", 4),
      entry("2026-03-31", 8),
      entry("2026-04-01", 8),
      entry("2026-04-02", 8),
    ]);
    // Unabhängig von der Serverzeit gehört der 4-h-Eintrag zum Montag
    expect([...byKey.keys()]).toEqual(["2026-03-30"]);
    expect(byKey.get("2026-03-30")?.type).toBe("incomplete");
    expect(byKey.get("2026-03-30")?.expectedHours).toBe(8);
  });
});
