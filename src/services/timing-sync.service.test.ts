import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, txMock, invalidateCache } = vi.hoisted(() => {
  process.env.TIMING_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64",
  );
  process.env.TIMING_API_BASE_URL = "https://timing.example.test/api/v1";
  const txMock = {
    timeEntry: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      createMany: vi.fn(),
    },
    absence: { findMany: vi.fn(), update: vi.fn() },
  };
  const prismaMock = {
    timingIntegration: { findUnique: vi.fn(), update: vi.fn() },
    timeEntry: { findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) =>
      fn(txMock),
    ),
  };
  return { prismaMock, txMock, invalidateCache: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/services/overtime.service", () => ({
  overtimeService: { invalidateCache },
}));

import { Prisma } from "@prisma/client";
import { encryptSecret } from "@/lib/crypto";
import {
  getSyncWindow,
  InvalidSyncRangeError,
  isSyncRunning,
  SyncInProgressError,
  sanitizeSyncError,
  syncTimingForUser,
  TimingNotConfiguredError,
  validateSyncRange,
} from "./timing-sync.service";

const TOKEN = "synthetic-token-abcd";
const NOW = new Date("2026-03-20T10:00:00.000Z");

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    userId: "user-1",
    apiTokenEnc: encryptSecret(TOKEN),
    projectRoots: ["Work"],
    syncEnabled: true,
    syncIntervalMinutes: 60,
    syncWindowDays: 35,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    lastSyncStats: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function apiEntry(id: string, chain: string[], start: string, end: string) {
  return {
    self: `/time-entries/${id}`,
    start_date: start,
    end_date: end,
    duration: (Date.parse(end) - Date.parse(start)) / 1000,
    project: { self: "/projects/1", title_chain: chain },
    title: "Alpha | 101: Backend",
    notes: null,
    is_running: false,
    billing_status: null,
  };
}

function fetchReturning(data: unknown[]) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ data, links: { next: null } }), {
        status: 200,
      }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.timingIntegration.findUnique.mockResolvedValue(integration());
  prismaMock.timingIntegration.update.mockResolvedValue({});
  txMock.timeEntry.findMany.mockResolvedValue([]);
  prismaMock.timeEntry.findMany.mockResolvedValue([]);
  prismaMock.timeEntry.updateMany.mockResolvedValue({ count: 1 });
});

describe("getSyncWindow / validateSyncRange", () => {
  it("rechnet das Fenster in Berlin-Tagen", () => {
    // 23:30 UTC am 19.03. ist in Berlin schon der 20.03.
    expect(getSyncWindow(35, new Date("2026-03-19T23:30:00.000Z"))).toEqual({
      from: "2026-02-13",
      to: "2026-03-20",
    });
  });

  it("lehnt ungültige und zu lange Zeiträume ab", () => {
    expect(() =>
      validateSyncRange({ from: "2026-13-01", to: "2026-12-31" }),
    ).toThrow(InvalidSyncRangeError);
    expect(() =>
      validateSyncRange({ from: "2026-03-02", to: "2026-03-01" }),
    ).toThrow(InvalidSyncRangeError);
    expect(() =>
      validateSyncRange({ from: "2024-01-01", to: "2026-01-01" }),
    ).toThrow(InvalidSyncRangeError);
    expect(validateSyncRange({ from: "2026-01-01", to: "2026-12-31" })).toEqual(
      {
        from: "2026-01-01",
        to: "2026-12-31",
      },
    );
  });
});

describe("sanitizeSyncError", () => {
  it("entfernt den Token aus Fehlertexten", () => {
    expect(sanitizeSyncError(new Error(`kaputt: ${TOKEN}`), TOKEN)).toBe(
      "kaputt: ***",
    );
  });
});

describe("syncTimingForUser", () => {
  it("schreibt neue, aktualisierte und gelöschte Einträge in einer Transaktion", async () => {
    txMock.timeEntry.findMany.mockResolvedValue([
      {
        id: "db-gone",
        externalId: "/time-entries/gone",
        source: "TIMING_SYNC",
        date: new Date("2026-03-10T00:00:00.000Z"),
        startTime: new Date("2026-03-10T08:00:00.000Z"),
        endTime: new Date("2026-03-10T09:00:00.000Z"),
        duration: new Prisma.Decimal(1),
        type: "WORK",
        description: null,
        title: null,
        notes: null,
        projectPath: "Work",
        billingStatus: null,
      },
      {
        id: "db-file",
        externalId: null,
        source: "FILE_IMPORT",
        date: new Date("2026-03-16T00:00:00.000Z"),
        startTime: new Date("2026-03-16T08:00:00.000Z"),
        endTime: new Date("2026-03-16T09:00:00.000Z"),
        duration: new Prisma.Decimal(1),
        type: "WORK",
        description: "x",
        title: "x",
        notes: null,
        projectPath: "Work",
        billingStatus: null,
      },
    ]);

    const fetchImpl = fetchReturning([
      apiEntry(
        "1",
        ["Work", "Firma", "Kunde A"],
        "2026-03-16T09:00:00.000000+01:00",
        "2026-03-16T11:00:00.000000+01:00",
      ),
      apiEntry(
        "2",
        ["Workshop"],
        "2026-03-16T12:00:00.000000+01:00",
        "2026-03-16T13:00:00.000000+01:00",
      ),
    ]);

    const stats = await syncTimingForUser("user-1", {
      trigger: "manual",
      fetchImpl,
      now: NOW,
    });

    expect(stats).toMatchObject({
      from: "2026-02-13",
      to: "2026-03-20",
      fetched: 2,
      kept: 1,
      created: 1,
      updated: 0,
      deleted: 1,
      replacedFileImports: 1,
    });
    expect(txMock.timeEntry.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", id: { in: ["db-gone", "db-file"] } },
    });
    const created = txMock.timeEntry.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      userId: "user-1",
      externalId: "/time-entries/1",
      source: "TIMING_SYNC",
      date: new Date("2026-03-16T00:00:00.000Z"),
      duration: 2,
      projectPath: "Work ▸ Firma ▸ Kunde A",
    });
    expect(invalidateCache).toHaveBeenCalledWith("user-1");
    expect(prismaMock.timingIntegration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastSyncStatus: "SUCCESS",
          lastSyncError: null,
        }),
      }),
    );
    expect(isSyncRunning("user-1")).toBe(false);
  });

  it("schreibt bei API-Fehlern nichts und protokolliert FAILED ohne Token", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("{}", { status: 401 }),
    ) as unknown as typeof fetch;

    await expect(
      syncTimingForUser("user-1", {
        trigger: "scheduler",
        fetchImpl,
        now: NOW,
      }),
    ).rejects.toThrow(/Token ungültig/);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    const update = prismaMock.timingIntegration.update.mock.calls[0][0];
    expect(update.data.lastSyncStatus).toBe("FAILED");
    expect(update.data.lastSyncAt).toBeInstanceOf(Date);
    expect(update.data.lastSyncError).not.toContain(TOKEN);
    expect(invalidateCache).not.toHaveBeenCalled();
  });

  it("lässt pro User nur einen Sync gleichzeitig laufen", async () => {
    let release: (value: Response) => void = () => {};
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ) as unknown as typeof fetch;

    const first = syncTimingForUser("user-1", {
      trigger: "manual",
      fetchImpl,
      now: NOW,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(isSyncRunning("user-1")).toBe(true);
    await expect(
      syncTimingForUser("user-1", {
        trigger: "scheduler",
        fetchImpl,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(SyncInProgressError);

    release(
      new Response(JSON.stringify({ data: [], links: {} }), { status: 200 }),
    );
    // Fenster 35 Tage → zwei Monats-Abschnitte; zweiten Abschnitt ebenfalls freigeben
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    release(
      new Response(JSON.stringify({ data: [], links: {} }), { status: 200 }),
    );
    await first;
    expect(isSyncRunning("user-1")).toBe(false);
  });

  it("vermerkt in Timing gelöschte Tage einer Timewarp-Abwesenheit als unterdrückt", async () => {
    txMock.timeEntry.findMany.mockResolvedValue([
      {
        id: "db-vacation",
        externalId: "/time-entries/vac",
        source: "TIMING_SYNC",
        date: new Date("2026-03-10T00:00:00.000Z"),
        startTime: new Date("2026-03-10T07:00:00.000Z"),
        endTime: new Date("2026-03-10T15:00:00.000Z"),
        duration: new Prisma.Decimal(8),
        type: "VACATION",
        description: "Urlaub",
        title: "Urlaub",
        notes: null,
        projectPath: "Work ▸ INNOQ ▸ Urlaub",
        billingStatus: null,
        absenceId: "abs-1",
      },
    ]);
    txMock.absence.findMany.mockResolvedValue([
      { id: "abs-1", suppressedDates: [] },
    ]);

    await syncTimingForUser("user-1", {
      trigger: "manual",
      fetchImpl: fetchReturning([]),
      now: NOW,
    });

    expect(txMock.timeEntry.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", id: { in: ["db-vacation"] } },
    });
    expect(txMock.absence.update).toHaveBeenCalledWith({
      where: { id: "abs-1" },
      data: { suppressedDates: ["2026-03-10"] },
    });
  });

  it("unterdrückt keinen Tag, dessen Eintrag nur außerhalb der Projekt-Wurzeln liegt", async () => {
    // Verknüpfter Urlaub im Projekt außerhalb der Wurzeln ["Work"]: Timing
    // liefert ihn noch, der Wurzel-Filter verwirft ihn nur – kein Löschen
    // in Timing, also auch kein unterdrückter Tag
    prismaMock.timingIntegration.findUnique.mockResolvedValue(
      integration({ projectRoots: ["Work"] }),
    );
    txMock.timeEntry.findMany.mockResolvedValue([
      {
        id: "db-vacation",
        externalId: "/time-entries/vac",
        source: "TIMING_SYNC",
        date: new Date("2026-03-10T00:00:00.000Z"),
        startTime: new Date("2026-03-10T07:00:00.000Z"),
        endTime: new Date("2026-03-10T15:00:00.000Z"),
        duration: new Prisma.Decimal(8),
        type: "VACATION",
        description: "Urlaub",
        title: "Urlaub",
        notes: null,
        projectPath: "Privat ▸ Urlaub",
        billingStatus: null,
        absenceId: "abs-1",
      },
    ]);
    txMock.absence.findMany.mockResolvedValue([
      { id: "abs-1", suppressedDates: [] },
    ]);

    await syncTimingForUser("user-1", {
      trigger: "manual",
      fetchImpl: fetchReturning([
        apiEntry(
          "vac",
          ["Privat", "Urlaub"],
          "2026-03-10T08:00:00+01:00",
          "2026-03-10T16:00:00+01:00",
        ),
      ]),
      now: NOW,
    });

    expect(txMock.absence.update).not.toHaveBeenCalled();
  });

  it("trägt begonnene Feiertage vor dem Abruf in Timing ein und verknüpft sie", async () => {
    prismaMock.timingIntegration.findUnique.mockResolvedValue(
      integration({
        writeHolidays: true,
        holidayProjectId: "/projects/9",
        holidaysSince: new Date("2026-03-01T00:00:00.000Z"),
      }),
    );
    prismaMock.timeEntry.findMany.mockResolvedValueOnce([
      {
        id: "db-holiday",
        date: new Date("2026-03-20T00:00:00.000Z"),
        duration: new Prisma.Decimal(8),
        description: "Testfeiertag",
      },
    ]);
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({
        method,
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (method === "POST") {
        return new Response(
          JSON.stringify({
            data: apiEntry(
              "77",
              ["Work", "INNOQ", "Feiertag"],
              "2026-03-20T08:00:00.000000+01:00",
              "2026-03-20T16:00:00.000000+01:00",
            ),
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({ data: [], links: { next: null } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const stats = await syncTimingForUser("user-1", {
      trigger: "manual",
      fetchImpl,
      now: NOW,
    });

    expect(stats.holidays).toEqual({
      pending: 1,
      created: 1,
      adopted: 0,
      failed: 0,
    });
    // Suche im Feiertagsprojekt, Anlegen, danach der eigentliche Abruf (je Monat)
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "GET", "GET"]);
    expect(calls[0].url).toContain("projects%5B%5D=%2Fprojects%2F9");
    expect(calls[1].body).toMatchObject({
      project: "/projects/9",
      title: "Testfeiertag",
      notes: "Feiertag aus R-Worktime",
      billing_status: "not_billable",
    });
    expect(prismaMock.timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "db-holiday", userId: "user-1", externalId: null },
      data: { externalId: "/time-entries/77" },
    });
    expect(prismaMock.timeEntry.findMany.mock.calls[0][0].where).toMatchObject({
      type: "HOLIDAY",
      source: "HOLIDAY",
      externalId: null,
      date: {
        gte: new Date("2026-03-01T00:00:00.000Z"),
        lte: new Date("2026-03-20T00:00:00.000Z"),
      },
    });
  });

  it("bricht den Sync nicht ab, wenn Feiertage nicht nach Timing gehen", async () => {
    prismaMock.timingIntegration.findUnique.mockResolvedValue(
      integration({
        writeHolidays: true,
        holidayProjectId: "/projects/9",
        holidaysSince: new Date("2026-03-01T00:00:00.000Z"),
      }),
    );
    prismaMock.timeEntry.findMany.mockResolvedValueOnce([
      {
        id: "db-holiday",
        date: new Date("2026-03-20T00:00:00.000Z"),
        duration: new Prisma.Decimal(8),
        description: null,
      },
    ]);
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ message: "nope" }), { status: 422 })
        : new Response(JSON.stringify({ data: [], links: { next: null } }), {
            status: 200,
          }),
    ) as unknown as typeof fetch;

    const stats = await syncTimingForUser("user-1", {
      trigger: "manual",
      fetchImpl,
      now: NOW,
    });

    expect(stats.holidays).toMatchObject({ created: 0, failed: 1 });
    expect(stats.holidays?.error).toMatch(/2026-03-20.*422/);
    expect(prismaMock.timeEntry.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.timingIntegration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastSyncStatus: "SUCCESS" }),
      }),
    );
  });

  it("fragt ohne eingeschaltete Feiertage weder DB noch Timing danach", async () => {
    const fetchImpl = fetchReturning([]);
    const stats = await syncTimingForUser("user-1", {
      trigger: "manual",
      fetchImpl,
      now: NOW,
    });
    expect(stats.holidays).toBeNull();
    expect(prismaMock.timeEntry.findMany).not.toHaveBeenCalled();
    // Nur der eigentliche Abruf, je Monat ein Abschnitt
    const urls = vi.mocked(fetchImpl).mock.calls.map(([url]) => String(url));
    expect(urls).toHaveLength(2);
    expect(urls.some((url) => url.includes("projects"))).toBe(false);
  });

  it("meldet fehlende Konfiguration", async () => {
    prismaMock.timingIntegration.findUnique.mockResolvedValue(
      integration({ apiTokenEnc: null }),
    );
    await expect(
      syncTimingForUser("user-1", { trigger: "manual", now: NOW }),
    ).rejects.toBeInstanceOf(TimingNotConfiguredError);
    expect(isSyncRunning("user-1")).toBe(false);
  });
});
