import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getUserSettings: vi.fn(),
  loadHolidays: vi.fn(),
  absenceFindMany: vi.fn(),
  timeEntryFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    absence: { findMany: mocks.absenceFindMany },
    timeEntry: { findMany: mocks.timeEntryFindMany },
  },
}));
vi.mock("@/services/settings.service", () => ({
  getUserSettings: mocks.getUserSettings,
}));
vi.mock("@/lib/reports/forecast-data", () => ({
  loadHolidays: mocks.loadHolidays,
}));

import { GET } from "./route";

function call(query: string) {
  return GET({
    nextUrl: new URL(`http://localhost/api/absences${query}`),
  } as never);
}

/** DB-Datum wie Prisma es für @db.Date liefert */
function dbDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

describe("GET /api/absences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getUserSettings.mockResolvedValue({
      weeklyWorkHours: 40,
      workDays: [1, 2, 3, 4, 5],
    });
    mocks.loadHolidays.mockResolvedValue({
      allKeys: new Set(["2026-12-25"]),
      names: {},
      unavailableYears: [],
    });
    mocks.absenceFindMany.mockResolvedValue([]);
    mocks.timeEntryFindMany.mockResolvedValue([]);
  });

  it("verlangt eine Anmeldung", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await call("?year=2026");
    expect(response.status).toBe(401);
    expect(mocks.absenceFindMany).not.toHaveBeenCalled();
  });

  it("lehnt ein ungültiges Jahr ab", async () => {
    const response = await call("?year=26");
    expect(response.status).toBe(400);
  });

  it("liefert Blöcke aus Abwesenheiten und losen Einträgen des Nutzers", async () => {
    mocks.absenceFindMany.mockResolvedValue([
      {
        id: "a1",
        source: "MANUAL",
        kind: "VACATION",
        startDate: dbDate("2026-12-28"),
        endDate: dbDate("2027-01-04"),
        halfDay: false,
        status: "ACTIVE",
      },
    ]);
    mocks.timeEntryFindMany.mockResolvedValue([
      {
        date: dbDate("2026-03-02"),
        type: "VACATION",
        duration: "8",
        source: "TIMING_SYNC",
      },
      {
        date: dbDate("2026-03-03"),
        type: "VACATION",
        duration: "8",
        source: "TIMING_SYNC",
      },
    ]);

    const response = await call("?year=2026");
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.year).toBe(2026);
    expect(body.blocks).toHaveLength(2);
    expect(body.blocks[0]).toMatchObject({
      id: null,
      source: "TIMING",
      from: "2026-03-02",
      to: "2026-03-03",
      days: 2,
      deletable: false,
    });
    expect(body.blocks[1]).toMatchObject({
      id: "a1",
      source: "MANUAL",
      from: "2026-12-28",
      to: "2027-01-04",
      deletable: true,
    });

    // Nur Daten des angemeldeten Nutzers, Überschneidung mit dem Jahr
    const absenceWhere = mocks.absenceFindMany.mock.calls[0][0].where;
    expect(absenceWhere.userId).toBe("user-1");
    expect(absenceWhere.startDate.lte).toBeInstanceOf(Date);
    expect(absenceWhere.endDate.gte).toBeInstanceOf(Date);
    const entryWhere = mocks.timeEntryFindMany.mock.calls[0][0].where;
    expect(entryWhere).toMatchObject({ userId: "user-1", absenceId: null });
    // Feiertage auch für das Folgejahr des Blocks über den Jahreswechsel
    expect(mocks.loadHolidays).toHaveBeenCalledWith("user-1", [2026, 2027]);
  });

  it("zählt von Hand gelöschte Tage einer Timewarp-Abwesenheit nicht mit", async () => {
    mocks.absenceFindMany.mockResolvedValue([
      {
        id: "a2",
        source: "TIMEWARP",
        kind: "VACATION",
        // Mo 21. bis Mi 23.12., der 22. unterdrückt
        startDate: dbDate("2026-12-21"),
        endDate: dbDate("2026-12-23"),
        halfDay: false,
        status: "ACTIVE",
        suppressedDates: ["2026-12-22"],
      },
    ]);
    mocks.timeEntryFindMany.mockResolvedValue([]);

    const body = await (await call("?year=2026")).json();
    expect(body.blocks).toHaveLength(1);
    expect(body.blocks[0]).toMatchObject({ id: "a2", days: 2 });
    expect(mocks.absenceFindMany.mock.calls[0][0].select).toMatchObject({
      suppressedDates: true,
    });
  });

  it("meldet Datenbankfehler als 500", async () => {
    mocks.absenceFindMany.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call("?year=2026");
    expect(response.status).toBe(500);
  });
});
