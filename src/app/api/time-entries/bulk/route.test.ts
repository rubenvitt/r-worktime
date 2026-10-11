import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    timeEntry: {
      findMany: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 2 })),
    },
    absence: {
      findMany: vi.fn(async () => [{ id: "abs-1", suppressedDates: [] }]),
      update: vi.fn(async () => ({})),
    },
  };
  return {
    auth: vi.fn(),
    deleteOwnTimingEntries: vi.fn(async () => 1),
    tx,
    prisma: {
      timeEntry: { count: vi.fn(async () => 2) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/services/overtime.service", () => ({
  overtimeService: { invalidateCache: vi.fn() },
}));
vi.mock("@/services/timing-entries.service", () => ({
  deleteOwnTimingEntries: mocks.deleteOwnTimingEntries,
}));

import { DELETE } from "./route";

function bulkDelete(body: unknown) {
  return DELETE(
    new Request("http://localhost/api/time-entries/bulk", {
      method: "DELETE",
      body: JSON.stringify(body),
    }) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.tx.timeEntry.findMany.mockImplementation(
    async (args: { where: Record<string, unknown> }) =>
      args.where.source === "TIMEWARP"
        ? [{ externalId: "/time-entries/9" }]
        : [
            {
              absenceId: "abs-1",
              date: new Date("2026-12-22T00:00:00.000Z"),
            },
          ],
  );
});

describe("DELETE /api/time-entries/bulk", () => {
  it("unterdrückt Timewarp-Tage und löscht eigene Einträge danach auch in Timing", async () => {
    const response = await bulkDelete({ ids: ["e1", "e2"] });

    expect(response.status).toBe(200);
    expect(mocks.tx.timeEntry.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        id: { in: ["e1", "e2"] },
        source: "TIMEWARP",
        externalId: { not: null },
      },
      select: { externalId: true },
    });
    expect(mocks.tx.absence.update).toHaveBeenCalledWith({
      where: { id: "abs-1" },
      data: { suppressedDates: ["2026-12-22"] },
    });
    expect(mocks.deleteOwnTimingEntries).toHaveBeenCalledWith("user-1", [
      "/time-entries/9",
    ]);
    // erst nach dem Commit
    expect(mocks.prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteOwnTimingEntries.mock.invocationCallOrder[0],
    );
  });
});
