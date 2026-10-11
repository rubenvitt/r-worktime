import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    timeEntry: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async (args: { data: unknown }) => ({
        id: "e1",
        ...(args.data as object),
      })),
    },
    absence: {
      findMany: vi.fn(),
      update: vi.fn(async () => ({})),
    },
  };
  return {
    auth: vi.fn(),
    invalidateCache: vi.fn(),
    deleteTimeEntry: vi.fn(async (_self: string) => {}),
    tx,
    prisma: {
      timingIntegration: {
        findUnique: vi.fn(async () => ({ apiTokenEnc: "enc-token" })),
      },
      timeEntry: {
        findFirst: vi.fn(),
        delete: vi.fn(async () => ({})),
        update: vi.fn(async (args: { data: unknown }) => ({
          id: "e1",
          ...(args.data as object),
        })),
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/services/overtime.service", () => ({
  overtimeService: { invalidateCache: mocks.invalidateCache },
}));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "timing-token" }));
vi.mock("@/lib/timing/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/timing/client")>()),
  createTimingClient: () => ({ deleteTimeEntry: mocks.deleteTimeEntry }),
}));

import { DELETE, PUT } from "./route";

const params = { params: Promise.resolve({ id: "e1" }) };

function timewarpEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    userId: "user-1",
    source: "TIMEWARP",
    externalId: "/time-entries/9",
    absenceId: "abs-1",
    date: new Date("2026-12-22T00:00:00.000Z"),
    startTime: new Date("2026-12-22T07:00:00.000Z"),
    endTime: new Date("2026-12-22T15:00:00.000Z"),
    duration: 8,
    type: "VACATION",
    description: "Urlaub - Aus Timewarp",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.tx.absence.findMany.mockResolvedValue([
    { id: "abs-1", suppressedDates: [] },
  ]);
});

describe("DELETE /api/time-entries/[id]", () => {
  it("unterdrückt den Tag einer Timewarp-Abwesenheit unter der Sperre", async () => {
    mocks.prisma.timeEntry.findFirst.mockResolvedValue(timewarpEntry());
    const response = await DELETE({} as never, params);

    expect(response.status).toBe(200);
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.timeEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: "e1", userId: "user-1" },
    });
    expect(mocks.tx.absence.update).toHaveBeenCalledWith({
      where: { id: "abs-1" },
      data: { suppressedDates: ["2026-12-22"] },
    });
    expect(mocks.prisma.timeEntry.delete).not.toHaveBeenCalled();
  });

  it("löscht einen vom Abgleich angelegten Eintrag auch in Timing", async () => {
    mocks.prisma.timeEntry.findFirst.mockResolvedValue(timewarpEntry());
    const response = await DELETE({} as never, params);

    expect(response.status).toBe(200);
    expect(mocks.deleteTimeEntry).toHaveBeenCalledWith("/time-entries/9");
    // erst nach der lokalen Löschung
    expect(
      mocks.tx.timeEntry.deleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.deleteTimeEntry.mock.invocationCallOrder[0]);
  });

  it("Timing-Fehler beim Löschen: lokal gelöscht und unterdrückt, Antwort 200", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.prisma.timeEntry.findFirst.mockResolvedValue(timewarpEntry());
    mocks.deleteTimeEntry.mockRejectedValueOnce(new Error("offline"));
    const response = await DELETE({} as never, params);

    expect(response.status).toBe(200);
    expect(mocks.tx.timeEntry.deleteMany).toHaveBeenCalled();
    expect(mocks.tx.absence.update).toHaveBeenCalledWith({
      where: { id: "abs-1" },
      data: { suppressedDates: ["2026-12-22"] },
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("löscht fremde Einträge (Timing-Sync) nie in Timing", async () => {
    mocks.prisma.timeEntry.findFirst.mockResolvedValue(
      timewarpEntry({ source: "TIMING_SYNC" }),
    );
    await DELETE({} as never, params);
    expect(mocks.deleteTimeEntry).not.toHaveBeenCalled();
  });

  it("löscht Einträge ohne Abwesenheit wie bisher, ohne Sperre", async () => {
    mocks.prisma.timeEntry.findFirst.mockResolvedValue(
      timewarpEntry({ source: "MANUAL", absenceId: null }),
    );
    await DELETE({} as never, params);
    expect(mocks.prisma.timeEntry.delete).toHaveBeenCalledWith({
      where: { id: "e1" },
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("PUT /api/time-entries/[id]", () => {
  function put(body: Record<string, unknown>) {
    return PUT(
      new Request("http://localhost/api/time-entries/e1", {
        method: "PUT",
        body: JSON.stringify(body),
      }) as never,
      params,
    );
  }

  it("macht einen bearbeiteten Timewarp-Eintrag MANUAL, entkoppelt ihn und unterdrückt den Tag", async () => {
    mocks.prisma.timeEntry.findFirst.mockResolvedValue(timewarpEntry());
    const response = await put({
      date: "2026-12-22T00:00:00.000Z",
      startTime: "2026-12-22T07:00:00.000Z",
      endTime: "2026-12-22T11:00:00.000Z",
      duration: 4,
      type: "VACATION",
      description: "Urlaub - Aus Timewarp",
    });

    expect(response.status).toBe(200);
    const data = mocks.tx.timeEntry.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      source: "MANUAL",
      absenceId: null,
      duration: 4,
    });
    expect(mocks.tx.absence.update).toHaveBeenCalledWith({
      where: { id: "abs-1" },
      data: { suppressedDates: ["2026-12-22"] },
    });
  });

  it("Speichern ohne Änderung lässt den Timewarp-Eintrag verknüpft", async () => {
    mocks.prisma.timeEntry.findFirst.mockResolvedValue(timewarpEntry());
    await put({
      date: "2026-12-22T00:00:00.000Z",
      startTime: "2026-12-22T07:00:00.000Z",
      endTime: "2026-12-22T15:00:00.000Z",
      duration: 8,
      type: "VACATION",
      description: "Urlaub - Aus Timewarp",
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    const data = mocks.prisma.timeEntry.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.source).toBeUndefined();
    expect(data.absenceId).toBeUndefined();
  });
  it("entkoppelt einen verknüpften Timing-Sync-Urlaub bei Typwechsel und unterdrückt den Tag", async () => {
    // Sonst legt der Abgleich den Urlaub neben der neuen Arbeit noch einmal an
    mocks.prisma.timeEntry.findFirst.mockResolvedValue(
      timewarpEntry({ source: "TIMING_SYNC", externalId: "/time-entries/7" }),
    );
    await put({
      date: "2026-12-22T00:00:00.000Z",
      startTime: "2026-12-22T07:00:00.000Z",
      endTime: "2026-12-22T15:00:00.000Z",
      duration: 8,
      type: "WORK",
      description: "Urlaub - Aus Timewarp",
    });
    const data = mocks.tx.timeEntry.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      source: "MANUAL",
      absenceId: null,
      type: "WORK",
    });
    expect(mocks.tx.absence.update).toHaveBeenCalledWith({
      where: { id: "abs-1" },
      data: { suppressedDates: ["2026-12-22"] },
    });
  });

  it("entkoppelt einen verknüpften Eintrag, der auf einen anderen Tag verschoben wird", async () => {
    mocks.prisma.timeEntry.findFirst.mockResolvedValue(
      timewarpEntry({ source: "TIMING_SYNC", externalId: "/time-entries/7" }),
    );
    await put({
      date: "2026-12-28T00:00:00.000Z",
      startTime: "2026-12-28T07:00:00.000Z",
      endTime: "2026-12-28T15:00:00.000Z",
      duration: 8,
      type: "VACATION",
      description: "Urlaub - Aus Timewarp",
    });
    expect(mocks.tx.timeEntry.update.mock.calls[0][0].data).toMatchObject({
      absenceId: null,
    });
    expect(mocks.tx.absence.update).toHaveBeenCalledWith({
      where: { id: "abs-1" },
      data: { suppressedDates: ["2026-12-22"] },
    });
  });
});
