import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  invalidateCache: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    absence: { findFirst: vi.fn(), delete: vi.fn() },
    timeEntry: { deleteMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx),
  },
}));
vi.mock("@/services/overtime.service", () => ({
  overtimeService: { invalidateCache: mocks.invalidateCache },
}));

import { DELETE } from "./route";

function call(id: string) {
  return DELETE({} as never, { params: Promise.resolve({ id }) });
}

describe("DELETE /api/absences/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.tx.$queryRaw.mockResolvedValue([]);
    mocks.tx.timeEntry.deleteMany.mockResolvedValue({ count: 3 });
  });

  it("verlangt eine Anmeldung", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await call("a1");
    expect(response.status).toBe(401);
    expect(mocks.tx.absence.findFirst).not.toHaveBeenCalled();
  });

  it("löscht eine manuelle Abwesenheit samt ihrer Einträge unter der Sperre", async () => {
    mocks.tx.absence.findFirst.mockResolvedValue({
      id: "a1",
      source: "MANUAL",
    });

    const response = await call("a1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deletedEntries: 3 });
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.$queryRaw.mock.calls[0][1]).toBe("absences:user-1");
    expect(mocks.tx.absence.findFirst).toHaveBeenCalledWith({
      where: { id: "a1", userId: "user-1" },
      select: { id: true, source: true },
    });
    expect(mocks.tx.timeEntry.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", absenceId: "a1" },
    });
    expect(mocks.tx.absence.delete).toHaveBeenCalledWith({
      where: { id: "a1" },
    });
    expect(mocks.invalidateCache).toHaveBeenCalledWith("user-1");
  });

  it("meldet 404 für fremde oder unbekannte Abwesenheiten", async () => {
    mocks.tx.absence.findFirst.mockResolvedValue(null);
    const response = await call("fremd");
    expect(response.status).toBe(404);
    expect(mocks.tx.timeEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("löscht keine Abwesenheit aus Timewarp", async () => {
    mocks.tx.absence.findFirst.mockResolvedValue({
      id: "a2",
      source: "TIMEWARP",
    });
    const response = await call("a2");
    expect(response.status).toBe(409);
    expect(mocks.tx.timeEntry.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.absence.delete).not.toHaveBeenCalled();
    expect(mocks.invalidateCache).not.toHaveBeenCalled();
  });
});
