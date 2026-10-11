import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  syncCalendarForUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({
  strictRateLimit: vi.fn(async () => null),
}));
vi.mock("@/services/calendar-sync.service", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/services/calendar-sync.service")
  >()),
  syncCalendarForUser: mocks.syncCalendarForUser,
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  CalendarNotConfiguredError,
  CalendarSyncInProgressError,
} from "@/services/calendar-sync.service";
import { POST } from "./route";

const call = () =>
  POST(
    new Request("http://localhost/api/calendar/sync", {
      method: "POST",
    }) as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
});

describe("POST /api/calendar/sync", () => {
  it("liefert das Ergebnis des Laufs, auch bei status error", async () => {
    const result = {
      status: "error",
      error: "Feed weg",
      stats: {},
      actions: [],
    };
    mocks.syncCalendarForUser.mockResolvedValue(result);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(mocks.syncCalendarForUser).toHaveBeenCalledWith("user-1", {
      trigger: "manual",
    });
  });

  it("antwortet mit 409, wenn schon ein Lauf läuft", async () => {
    mocks.syncCalendarForUser.mockRejectedValue(
      new CalendarSyncInProgressError(),
    );
    const response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/läuft bereits/);
  });

  it("antwortet mit 400 ohne Feed-URL und 401 ohne Anmeldung", async () => {
    mocks.syncCalendarForUser.mockRejectedValue(
      new CalendarNotConfiguredError(),
    );
    expect((await call()).status).toBe(400);
    mocks.auth.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });
});
