import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, calendar, timing } = vi.hoisted(() => {
  process.env.TIMING_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString(
    "base64",
  );
  class CalendarSyncInProgressError extends Error {}
  return {
    prismaMock: {
      timingIntegration: { findMany: vi.fn() },
      calendarIntegration: { findMany: vi.fn() },
    },
    calendar: {
      CalendarSyncInProgressError,
      isCalendarSyncRunning: vi.fn((_userId: string) => false),
      syncCalendarForUser: vi.fn(),
    },
    timing: {
      isSyncRunning: vi.fn(() => false),
      SyncInProgressError: class extends Error {},
      sanitizeSyncError: vi.fn(() => "Fehler"),
      syncTimingForUser: vi.fn(),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/services/calendar-sync.service", () => calendar);
vi.mock("@/services/timing-sync.service", () => timing);

import { runCalendarSyncs, runSchedulerTick } from "./scheduler";

const NOW = new Date("2026-10-11T10:00:00.000Z");

function integration(userId: string, lastSyncAt: Date | null) {
  return { userId, syncEnabled: true, feedUrlEnc: "enc", lastSyncAt };
}

const okResult = {
  status: "success",
  stats: {
    created: 0,
    timingCreated: 1,
    timingAdopted: 0,
    linked: 0,
    deleted: 0,
    failed: 0,
  },
  actions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  prismaMock.timingIntegration.findMany.mockResolvedValue([]);
  prismaMock.calendarIntegration.findMany.mockResolvedValue([]);
  calendar.syncCalendarForUser.mockResolvedValue(okResult);
});

describe("runCalendarSyncs", () => {
  it("gleicht nur fällige Integrationen ab, stündlich", async () => {
    prismaMock.calendarIntegration.findMany.mockResolvedValue([
      integration("due-never", null),
      integration("due-old", new Date("2026-10-11T08:59:00.000Z")),
      integration("recent", new Date("2026-10-11T09:30:00.000Z")),
    ]);
    await runCalendarSyncs(NOW);
    expect(
      calendar.syncCalendarForUser.mock.calls.map((call) => call[0]),
    ).toEqual(["due-never", "due-old"]);
    expect(calendar.syncCalendarForUser).toHaveBeenCalledWith("due-never", {
      trigger: "scheduler",
    });
  });

  it("überspringt laufende Abgleiche und macht nach einem Fehler weiter", async () => {
    prismaMock.calendarIntegration.findMany.mockResolvedValue([
      integration("running", null),
      integration("broken", null),
      integration("fine", null),
    ]);
    calendar.isCalendarSyncRunning.mockImplementation(
      (userId: string) => userId === "running",
    );
    calendar.syncCalendarForUser.mockImplementation(async (userId: string) => {
      if (userId === "broken") throw new Error("kaputt");
      return okResult;
    });
    await runCalendarSyncs(NOW);
    expect(
      calendar.syncCalendarForUser.mock.calls.map((call) => call[0]),
    ).toEqual(["broken", "fine"]);
  });
});

describe("runSchedulerTick", () => {
  it("führt den Kalender-Abgleich auch aus, wenn der Timing-Teil scheitert", async () => {
    prismaMock.timingIntegration.findMany.mockRejectedValue(
      new Error("DB weg"),
    );
    prismaMock.calendarIntegration.findMany.mockResolvedValue([
      integration("u1", null),
    ]);
    await runSchedulerTick(NOW);
    expect(calendar.syncCalendarForUser).toHaveBeenCalledTimes(1);

    // Tick-Sperre wurde freigegeben: der nächste Tick läuft wieder
    prismaMock.calendarIntegration.findMany.mockRejectedValue(
      new Error("DB weg"),
    );
    await expect(runSchedulerTick(NOW)).resolves.toBeUndefined();
    await runSchedulerTick(NOW);
    expect(prismaMock.calendarIntegration.findMany).toHaveBeenCalledTimes(3);
  });
});
