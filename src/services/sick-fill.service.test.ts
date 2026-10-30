import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  txMock,
  invalidateCache,
  createTimeEntry,
  deleteTimeEntry,
  timingClient,
} = vi.hoisted(() => {
  const txMock = {
    $queryRaw: vi.fn(),
    timeEntry: { findMany: vi.fn(), create: vi.fn() },
  };
  const prismaMock = {
    timingIntegration: { findUnique: vi.fn() },
    timeEntry: { update: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) =>
      fn(txMock),
    ),
  };
  const createTimeEntry = vi.fn();
  return {
    prismaMock,
    txMock,
    invalidateCache: vi.fn(),
    createTimeEntry,
    deleteTimeEntry: vi.fn(),
    timingClient: vi.fn(),
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
vi.mock("@/services/timing-entries.service", () => ({
  timingClientForUser: timingClient,
}));

import { Prisma } from "@prisma/client";
import { fillSickDay } from "./sick-fill.service";

const NOW = new Date("2026-10-30T12:00:00.000Z");

function integration(overrides: Record<string, unknown> = {}) {
  return {
    apiTokenEnc: "v1:enc",
    sickProjectId: "/projects/7",
    projectRoots: ["Work"],
    ...overrides,
  };
}

function created(chain: string[]) {
  return {
    self: "/time-entries/99",
    start_date: "2026-10-28T08:00:00+01:00",
    end_date: "2026-10-28T16:00:00+01:00",
    duration: 8 * 3600,
    project: { self: "/projects/7", title_chain: chain },
    title: "Krank",
    notes: "Krank aus R-Worktime",
    is_running: false,
    billing_status: "not_billable",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  txMock.timeEntry.findMany.mockResolvedValue([]);
  txMock.timeEntry.create.mockResolvedValue({ id: "e1" });
  prismaMock.timingIntegration.findUnique.mockResolvedValue(integration());
  timingClient.mockResolvedValue({
    client: { createTimeEntry, deleteTimeEntry },
    problem: null,
  });
  createTimeEntry.mockResolvedValue(created(["Work", "INNOQ", "Krank"]));
});

describe("fillSickDay", () => {
  it("füllt einen leeren Tag auf, trägt ihn in Timing ein und übergibt ihn dem Sync", async () => {
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
    expect(createTimeEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRef: "/projects/7",
        title: "Krank",
        billingStatus: "not_billable",
      }),
    );
    expect(prismaMock.timeEntry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: expect.objectContaining({
        externalId: "/time-entries/99",
        source: "TIMING_SYNC",
        type: "SICK",
        projectPath: "Work ▸ INNOQ ▸ Krank",
        createdInTiming: true,
      }),
    });
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
    prismaMock.timingIntegration.findUnique.mockResolvedValue(
      integration({ sickProjectId: null }),
    );
    const result = await fillSickDay("user-1", "2026-10-28", NOW);
    expect(result).toMatchObject({
      created: true,
      timing: { status: "local" },
    });
    expect(createTimeEntry).not.toHaveBeenCalled();
  });

  it("schreibt heute vor 08:00 noch nicht nach Timing", async () => {
    const result = await fillSickDay(
      "user-1",
      "2026-10-30",
      new Date("2026-10-30T06:00:00.000Z"),
    );
    expect(result).toMatchObject({
      created: true,
      timing: { status: "future" },
    });
    expect(createTimeEntry).not.toHaveBeenCalled();
  });

  it("hängt außerhalb der Projekt-Wurzeln nur die ID an", async () => {
    createTimeEntry.mockResolvedValue(created(["Privat", "Krank"]));
    await fillSickDay("user-1", "2026-10-28", NOW);
    expect(prismaMock.timeEntry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { externalId: "/time-entries/99", createdInTiming: true },
    });
  });

  it("übergibt nicht dem Sync, wenn er das Projekt nicht als Krankheit erkennt", async () => {
    createTimeEntry.mockResolvedValue(created(["Work", "INNOQ", "Kunde"]));
    await fillSickDay("user-1", "2026-10-28", NOW);
    expect(prismaMock.timeEntry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { externalId: "/time-entries/99", createdInTiming: true },
    });
  });

  it("behält den lokalen Eintrag, wenn Timing scheitert", async () => {
    createTimeEntry.mockRejectedValue(new Error("boom"));
    const result = await fillSickDay("user-1", "2026-10-28", NOW);
    expect(result).toMatchObject({
      created: true,
      timing: { status: "failed", error: "Timing-API nicht erreichbar." },
    });
    expect(prismaMock.timeEntry.update).not.toHaveBeenCalled();
    expect(prismaMock.timeEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("räumt den lokalen Eintrag weg, wenn ein paralleler Sync ihn schon abgerufen hat", async () => {
    prismaMock.timeEntry.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    const result = await fillSickDay("user-1", "2026-10-28", NOW);
    expect(result).toMatchObject({ timing: { status: "synced" } });
    expect(prismaMock.timeEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: "e1", userId: "user-1" },
    });
  });

  it("nimmt den Timing-Eintrag zurück, wenn das Verknüpfen sonst scheitert", async () => {
    prismaMock.timeEntry.update.mockRejectedValue(new Error("db down"));
    prismaMock.timeEntry.findFirst.mockResolvedValue({ externalId: null });
    const result = await fillSickDay("user-1", "2026-10-28", NOW);
    expect(result).toMatchObject({
      created: true,
      timing: { status: "failed" },
    });
    expect(deleteTimeEntry).toHaveBeenCalledWith("/time-entries/99");
    expect(prismaMock.timeEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("lässt den Timing-Eintrag stehen, wenn das Update doch angekommen ist", async () => {
    prismaMock.timeEntry.update.mockRejectedValue(new Error("conn reset"));
    prismaMock.timeEntry.findFirst.mockResolvedValue({
      externalId: "/time-entries/99",
    });
    await fillSickDay("user-1", "2026-10-28", NOW);
    expect(deleteTimeEntry).not.toHaveBeenCalled();
  });

  it("lässt den Timing-Eintrag stehen, wenn sich der lokale Stand nicht prüfen lässt", async () => {
    prismaMock.timeEntry.update.mockRejectedValue(new Error("db down"));
    prismaMock.timeEntry.findFirst.mockRejectedValue(new Error("db down"));
    await fillSickDay("user-1", "2026-10-28", NOW);
    expect(deleteTimeEntry).not.toHaveBeenCalled();
  });
});
