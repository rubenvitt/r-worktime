import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, client } = vi.hoisted(() => {
  const prismaMock = {
    timeEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  const client = {
    listTimeEntries: vi.fn(),
    createTimeEntry: vi.fn(),
    deleteTimeEntry: vi.fn(),
    listProjects: vi.fn(),
    testConnection: vi.fn(),
  };
  return { prismaMock, client };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/services/timing-entries.service", () => ({
  timingClientForUser: vi.fn(),
}));

import { Prisma } from "@prisma/client";
import { pushPendingSickEntries } from "./sick-timing.service";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const SINCE = new Date("2026-10-01T00:00:00.000Z");

const integration = {
  sickProjectId: "/projects/7",
  sickSince: SINCE,
  projectRoots: ["Work"],
};

function row(id: string, start: string, end: string) {
  return {
    id,
    startTime: new Date(start),
    endTime: new Date(end),
    title: "Krankheit",
    notes: null,
    description: "Krankheit",
  };
}

function remote(self: string, chain: string[], start: string, end: string) {
  return {
    self,
    start_date: start,
    end_date: end,
    duration: (Date.parse(end) - Date.parse(start)) / 1000,
    project: { self: "/projects/7", title_chain: chain },
    title: "Krankheit",
    notes: "Krank aus R-Worktime",
    is_running: false,
    billing_status: "not_billable",
  };
}

const DAY = row("e1", "2026-10-28T07:00:00.000Z", "2026-10-28T15:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.timeEntry.findMany.mockImplementation(
    async (args: { where: { externalId?: unknown } }) =>
      // Erster Aufruf: offene Krank-Einträge; zweiter: schon benutzte IDs
      args.where.externalId === null ? [DAY] : [],
  );
  prismaMock.timeEntry.updateMany.mockResolvedValue({ count: 1 });
  client.listTimeEntries.mockResolvedValue([]);
  client.createTimeEntry.mockResolvedValue(
    remote(
      "/time-entries/99",
      ["Work", "INNOQ", "Krankheit"],
      "2026-10-28T08:00:00+01:00",
      "2026-10-28T16:00:00+01:00",
    ),
  );
});

describe("pushPendingSickEntries", () => {
  it("ist ohne Krank-Projekt aus", async () => {
    expect(
      await pushPendingSickEntries(
        "user-1",
        { ...integration, sickProjectId: null },
        client,
        NOW,
      ),
    ).toBeNull();
    expect(prismaMock.timeEntry.findMany).not.toHaveBeenCalled();
  });

  it("sucht nur begonnene manuelle Krank-Einträge seit dem Wählen des Projekts", async () => {
    await pushPendingSickEntries("user-1", integration, client, NOW);
    expect(prismaMock.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          type: "SICK",
          source: "MANUAL",
          externalId: null,
          createdAt: { gte: SINCE },
          startTime: { lte: NOW },
        },
      }),
    );
  });

  it("legt den Eintrag in Timing an und übergibt ihn dem Sync", async () => {
    const stats = await pushPendingSickEntries(
      "user-1",
      integration,
      client,
      NOW,
    );
    expect(stats).toEqual({ pending: 1, created: 1, adopted: 0, failed: 0 });
    expect(client.createTimeEntry).toHaveBeenCalledWith({
      start: DAY.startTime,
      end: DAY.endTime,
      projectRef: "/projects/7",
      title: "Krankheit",
      notes: "Krank aus R-Worktime",
      billingStatus: "not_billable",
    });
    expect(prismaMock.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "e1", userId: "user-1", externalId: null },
      data: expect.objectContaining({
        externalId: "/time-entries/99",
        source: "TIMING_SYNC",
        type: "SICK",
        projectPath: "Work ▸ INNOQ ▸ Krankheit",
        createdInTiming: true,
      }),
    });
  });

  it("übernimmt einen gleichen Eintrag, statt ihn doppelt anzulegen", async () => {
    client.listTimeEntries.mockResolvedValue([
      remote(
        "/time-entries/50",
        ["Work", "INNOQ", "Krankheit"],
        "2026-10-28T08:00:00+01:00",
        "2026-10-28T16:00:00+01:00",
      ),
    ]);
    const stats = await pushPendingSickEntries(
      "user-1",
      integration,
      client,
      NOW,
    );
    expect(stats).toMatchObject({ created: 0, adopted: 1 });
    expect(client.createTimeEntry).not.toHaveBeenCalled();
    expect(prismaMock.timeEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ externalId: "/time-entries/50" }),
      }),
    );
  });

  it("hängt außerhalb der Projekt-Wurzeln nur die ID an", async () => {
    client.createTimeEntry.mockResolvedValue(
      remote(
        "/time-entries/99",
        ["Privat", "Krankheit"],
        "2026-10-28T08:00:00+01:00",
        "2026-10-28T16:00:00+01:00",
      ),
    );
    await pushPendingSickEntries("user-1", integration, client, NOW);
    expect(prismaMock.timeEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { externalId: "/time-entries/99", createdInTiming: true },
      }),
    );
  });

  it("übergibt nicht dem Sync, wenn er das Projekt nicht als Krankheit erkennt", async () => {
    client.createTimeEntry.mockResolvedValue(
      remote(
        "/time-entries/99",
        ["Work", "INNOQ", "Kunde"],
        "2026-10-28T08:00:00+01:00",
        "2026-10-28T16:00:00+01:00",
      ),
    );
    await pushPendingSickEntries("user-1", integration, client, NOW);
    expect(prismaMock.timeEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { externalId: "/time-entries/99", createdInTiming: true },
      }),
    );
  });

  it("zählt Fehler beim Anlegen und macht weiter", async () => {
    client.createTimeEntry.mockRejectedValue(new Error("boom"));
    const stats = await pushPendingSickEntries(
      "user-1",
      integration,
      client,
      NOW,
    );
    expect(stats).toMatchObject({
      created: 0,
      failed: 1,
      error: "Krank 2026-10-28: Timing-API nicht erreichbar.",
    });
    expect(prismaMock.timeEntry.updateMany).not.toHaveBeenCalled();
  });

  it("nimmt den neuen Timing-Eintrag zurück, wenn der lokale inzwischen verknüpft ist", async () => {
    prismaMock.timeEntry.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.timeEntry.findFirst.mockResolvedValue(null);
    await pushPendingSickEntries("user-1", integration, client, NOW);
    expect(client.deleteTimeEntry).toHaveBeenCalledWith("/time-entries/99");
  });

  it("räumt den lokalen Eintrag weg, wenn ein paralleler Sync ihn schon abgerufen hat", async () => {
    prismaMock.timeEntry.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    const stats = await pushPendingSickEntries(
      "user-1",
      integration,
      client,
      NOW,
    );
    expect(stats).toMatchObject({ created: 1, failed: 0 });
    expect(prismaMock.timeEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: "e1", userId: "user-1" },
    });
    expect(client.deleteTimeEntry).not.toHaveBeenCalled();
  });

  it("nimmt den Timing-Eintrag bei sonstigem Fehler nur zurück, wenn der lokale sicher unverknüpft ist", async () => {
    prismaMock.timeEntry.updateMany.mockRejectedValue(new Error("db down"));
    prismaMock.timeEntry.findFirst.mockResolvedValue({ externalId: null });
    const stats = await pushPendingSickEntries(
      "user-1",
      integration,
      client,
      NOW,
    );
    expect(stats).toMatchObject({ failed: 1 });
    expect(client.deleteTimeEntry).toHaveBeenCalledWith("/time-entries/99");
  });

  it("lässt den Timing-Eintrag stehen, wenn das Update doch angekommen ist", async () => {
    prismaMock.timeEntry.updateMany.mockRejectedValue(new Error("conn reset"));
    prismaMock.timeEntry.findFirst.mockResolvedValue({
      externalId: "/time-entries/99",
    });
    await pushPendingSickEntries("user-1", integration, client, NOW);
    expect(client.deleteTimeEntry).not.toHaveBeenCalled();
  });

  it("lässt den Timing-Eintrag stehen, wenn sich der lokale Stand nicht prüfen lässt", async () => {
    prismaMock.timeEntry.updateMany.mockRejectedValue(new Error("db down"));
    prismaMock.timeEntry.findFirst.mockRejectedValue(new Error("db down"));
    await pushPendingSickEntries("user-1", integration, client, NOW);
    expect(client.deleteTimeEntry).not.toHaveBeenCalled();
  });

  it("meldet einen Fehler bei der Suche in Timing für alle offenen Einträge", async () => {
    client.listTimeEntries.mockRejectedValue(new Error("boom"));
    const stats = await pushPendingSickEntries(
      "user-1",
      integration,
      client,
      NOW,
    );
    expect(stats).toMatchObject({
      pending: 1,
      failed: 1,
      error: "Suche in Timing fehlgeschlagen: Timing-API nicht erreichbar.",
    });
    expect(client.createTimeEntry).not.toHaveBeenCalled();
  });
});
