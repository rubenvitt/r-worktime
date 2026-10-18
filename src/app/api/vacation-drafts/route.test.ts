import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  vacationDraft: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { vacationDraft: mocks.vacationDraft },
}));

import { DELETE, PATCH } from "./[id]/route";
import { POST } from "./route";

function jsonRequest(body: unknown) {
  return { json: async () => body } as never;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function row(from: string, to: string, note: string | null = null) {
  return {
    id: "d1",
    userId: "user-1",
    startDate: new Date(`${from}T00:00:00.000Z`),
    endDate: new Date(`${to}T00:00:00.000Z`),
    note,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T10:00:00.000Z"));
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/vacation-drafts", () => {
  it("legt einen Entwurf für den Nutzer an", async () => {
    mocks.vacationDraft.create.mockResolvedValue(
      row("2027-05-03", "2027-05-07", "Ostsee"),
    );
    const response = await POST(
      jsonRequest({ from: "2027-05-03", to: "2027-05-07", note: " Ostsee " }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "d1",
      from: "2027-05-03",
      to: "2027-05-07",
      note: "Ostsee",
    });
    expect(mocks.vacationDraft.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        startDate: new Date("2027-05-03T00:00:00.000Z"),
        endDate: new Date("2027-05-07T00:00:00.000Z"),
        note: "Ostsee",
      },
    });
  });

  it.each([
    [{ from: "2027-05-07", to: "2027-05-03" }, /Beginn liegt nach dem Ende/],
    [{ from: "2029-01-02", to: "2029-01-03" }, /nächsten Jahr/],
    [{ from: "2027-01-01", to: "2027-04-01" }, /höchstens 62 Tage/],
    [{ from: "2027-13-01", to: "2027-13-02" }, /Ungültiges Datum/],
  ])("lehnt %o ab", async (body, message) => {
    const response = await POST(jsonRequest(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(message);
    expect(mocks.vacationDraft.create).not.toHaveBeenCalled();
  });

  it("verlangt eine Anmeldung", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await POST(
      jsonRequest({ from: "2027-05-03", to: "2027-05-07" }),
    );
    expect(response.status).toBe(401);
  });
});

describe("PATCH/DELETE /api/vacation-drafts/[id]", () => {
  it("ändert nur die Notiz und behält den Zeitraum", async () => {
    mocks.vacationDraft.findFirst.mockResolvedValue(
      row("2027-05-03", "2027-05-07"),
    );
    mocks.vacationDraft.update.mockResolvedValue(
      row("2027-05-03", "2027-05-07", "neu"),
    );
    const response = await PATCH(jsonRequest({ note: "neu" }), params("d1"));
    expect(response.status).toBe(200);
    expect(mocks.vacationDraft.findFirst).toHaveBeenCalledWith({
      where: { id: "d1", userId: "user-1" },
    });
    expect(mocks.vacationDraft.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: {
        startDate: new Date("2027-05-03T00:00:00.000Z"),
        endDate: new Date("2027-05-07T00:00:00.000Z"),
        note: "neu",
      },
    });
  });

  it("prüft einen geänderten Zeitraum gegen den alten Beginn", async () => {
    mocks.vacationDraft.findFirst.mockResolvedValue(
      row("2027-05-03", "2027-05-07"),
    );
    const response = await PATCH(
      jsonRequest({ to: "2027-05-01" }),
      params("d1"),
    );
    expect(response.status).toBe(400);
    expect(mocks.vacationDraft.update).not.toHaveBeenCalled();
  });

  it("meldet 404 für fremde Entwürfe", async () => {
    mocks.vacationDraft.findFirst.mockResolvedValue(null);
    expect(
      (await PATCH(jsonRequest({ note: "x" }), params("fremd"))).status,
    ).toBe(404);
    mocks.vacationDraft.deleteMany.mockResolvedValue({ count: 0 });
    expect((await DELETE({} as never, params("fremd"))).status).toBe(404);
    expect(mocks.vacationDraft.deleteMany).toHaveBeenCalledWith({
      where: { id: "fremd", userId: "user-1" },
    });
  });

  it("löscht einen eigenen Entwurf", async () => {
    mocks.vacationDraft.deleteMany.mockResolvedValue({ count: 1 });
    expect((await DELETE({} as never, params("d1"))).status).toBe(204);
  });
});
