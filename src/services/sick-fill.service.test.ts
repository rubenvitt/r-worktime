import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, invalidateCache, pushNow } = vi.hoisted(() => {
  const txMock = {
    $queryRaw: vi.fn(),
    timeEntry: { findMany: vi.fn(), create: vi.fn() },
  };
  const prismaMock = {
    timingIntegration: { findUnique: vi.fn() },
    timeEntry: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) =>
      fn(txMock),
    ),
  };
  return {
    prismaMock,
    txMock,
    invalidateCache: vi.fn(),
    pushNow: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/services/overtime.service", () => ({
  overtimeService: { invalidateCache },
}));
vi.mock("@/services/settings.service", () => ({
  getUserSettings: vi.fn(async () => ({
    weeklyWorkHours: 40,
    workDays: [1, 2, 3, 4, 5],
  })),
}));
vi.mock("@/services/holiday.service", () => ({
  loadOfficialHolidays: vi.fn(async () => ({
    names: { "2026-10-03": "Tag der Deutschen Einheit" },
    unavailableYears: [],
  })),
}));
vi.mock("@/services/sick-timing.service", () => ({
  pushPendingSickEntriesNow: pushNow,
}));

import { Prisma } from "@prisma/client";
import { fillSickDay } from "./sick-fill.service";

const NOW = new Date("2026-10-30T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  txMock.timeEntry.findMany.mockResolvedValue([]);
  txMock.timeEntry.create.mockResolvedValue({ id: "e1" });
  prismaMock.timingIntegration.findUnique.mockResolvedValue({
    apiTokenEnc: "v1:enc",
    sickProjectId: "/projects/7",
  });
  pushNow.mockResolvedValue({ pending: 1, created: 1, adopted: 0, failed: 0 });
  prismaMock.timeEntry.findFirst.mockResolvedValue({
    externalId: "/time-entries/99",
  });
});

describe("fillSickDay", () => {
  it("füllt einen leeren Tag auf und überträgt ihn nach Timing", async () => {
    const result = await fillSickDay("user-1", "2026-10-28", NOW);

    expect(result).toEqual({
      created: true,
      dateKey: "2026-10-28",
      hours: 8,
      timing: { status: "synced" },
    });
    expect(txMock.$queryRaw).toHaveBeenCalled();
    expect(txMock.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "SICK",
          duration: 8,
          description: "Krank",
          source: "MANUAL",
          startTime: new Date("2026-10-28T07:00:00.000Z"),
          endTime: new Date("2026-10-28T15:00:00.000Z"),
        }),
      }),
    );
    expect(pushNow).toHaveBeenCalledWith("user-1", NOW);
    expect(invalidateCache).toHaveBeenCalledWith("user-1");
  });

  it("füllt nur den Rest bis zum Soll", async () => {
    txMock.timeEntry.findMany.mockResolvedValue([
      {
        startTime: new Date("2026-10-28T07:00:00.000Z"),
        endTime: new Date("2026-10-28T10:00:00.000Z"),
        duration: new Prisma.Decimal(3),
        type: "WORK",
      },
    ]);
    const result = await fillSickDay("user-1", "2026-10-28", NOW);
    expect(result).toMatchObject({ created: true, hours: 5 });
    expect(txMock.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startTime: new Date("2026-10-28T10:00:00.000Z"),
          duration: 5,
        }),
      }),
    );
  });

  it("legt nichts an, wenn das Soll erreicht ist", async () => {
    txMock.timeEntry.findMany.mockResolvedValue([
      {
        startTime: new Date("2026-10-28T07:00:00.000Z"),
        endTime: new Date("2026-10-28T15:00:00.000Z"),
        duration: new Prisma.Decimal(8),
        type: "WORK",
      },
    ]);
    expect(await fillSickDay("user-1", "2026-10-28", NOW)).toEqual({
      created: false,
      dateKey: "2026-10-28",
      reason: "full",
    });
    expect(txMock.timeEntry.create).not.toHaveBeenCalled();
  });

  it("legt an Wochenenden und Feiertagen nichts an", async () => {
    expect(await fillSickDay("user-1", "2026-10-31", NOW)).toMatchObject({
      created: false,
      reason: "noTarget",
    });
    expect(await fillSickDay("user-1", "2026-10-03", NOW)).toMatchObject({
      created: false,
      reason: "noTarget",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("bleibt ohne Krank-Projekt lokal", async () => {
    prismaMock.timingIntegration.findUnique.mockResolvedValue({
      apiTokenEnc: "v1:enc",
      sickProjectId: null,
    });
    const result = await fillSickDay("user-1", "2026-10-28", NOW);
    expect(result).toMatchObject({
      created: true,
      timing: { status: "local" },
    });
    expect(pushNow).not.toHaveBeenCalled();
  });

  it("überlässt heute vor 08:00 den Eintrag dem Sync", async () => {
    const result = await fillSickDay(
      "user-1",
      "2026-10-30",
      new Date("2026-10-30T06:00:00.000Z"),
    );
    expect(result).toMatchObject({
      created: true,
      timing: { status: "future" },
    });
    expect(pushNow).not.toHaveBeenCalled();
  });

  it("meldet den Fehler, wenn der Eintrag danach noch unverknüpft ist", async () => {
    pushNow.mockResolvedValue({
      pending: 1,
      created: 0,
      adopted: 0,
      failed: 1,
      error: "Krank 2026-10-28: Timing-API nicht erreichbar.",
    });
    prismaMock.timeEntry.findFirst.mockResolvedValue({ externalId: null });
    const result = await fillSickDay("user-1", "2026-10-28", NOW);
    expect(result).toMatchObject({
      created: true,
      timing: {
        status: "failed",
        error: "Krank 2026-10-28: Timing-API nicht erreichbar.",
      },
    });
  });

  it("gilt als übertragen, wenn ein paralleler Sync den Eintrag übernommen hat", async () => {
    prismaMock.timeEntry.findFirst.mockResolvedValue(null);
    const result = await fillSickDay("user-1", "2026-10-28", NOW);
    expect(result).toMatchObject({ timing: { status: "synced" } });
  });
});
