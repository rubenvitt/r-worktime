import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  deleteTimeEntry: vi.fn(async (_self: string) => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { timingIntegration: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "timing-token" }));
vi.mock("@/lib/timing/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/timing/client")>()),
  createTimingClient: () => ({ deleteTimeEntry: mocks.deleteTimeEntry }),
}));

import { deleteOwnTimingEntries } from "./timing-entries.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue({ apiTokenEnc: "enc" });
});

describe("deleteOwnTimingEntries", () => {
  it("löscht jede gültige Timing-ID einmal", async () => {
    const deleted = await deleteOwnTimingEntries("user-1", [
      "/time-entries/1",
      "/time-entries/1",
      null,
      "kaputt",
      "/time-entries/2",
    ]);
    expect(deleted).toBe(2);
    expect(mocks.deleteTimeEntry.mock.calls).toEqual([
      ["/time-entries/1"],
      ["/time-entries/2"],
    ]);
  });

  it("wirft nie: Timing-Fehler und fehlender Token werden nur geloggt", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.deleteTimeEntry.mockRejectedValueOnce(new Error("offline"));
    await expect(
      deleteOwnTimingEntries("user-1", ["/time-entries/1", "/time-entries/2"]),
    ).resolves.toBe(1);

    mocks.findUnique.mockResolvedValue(null);
    await expect(
      deleteOwnTimingEntries("user-1", ["/time-entries/3"]),
    ).resolves.toBe(0);
    expect(error).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
  });

  it("ruft ohne IDs nichts auf", async () => {
    await expect(deleteOwnTimingEntries("user-1", [])).resolves.toBe(0);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
