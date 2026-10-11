import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.TIMING_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString(
    "base64",
  );
  return {
    auth: vi.fn(),
    fetchCalendarFeed: vi.fn(),
    prisma: {
      calendarIntegration: { findUnique: vi.fn(), upsert: vi.fn() },
      timingIntegration: { findUnique: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/rate-limit", () => ({
  strictRateLimit: vi.fn(async () => null),
}));
vi.mock("@/lib/calendar/feed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calendar/feed")>()),
  fetchCalendarFeed: mocks.fetchCalendarFeed,
}));

import { CalendarFeedError } from "@/lib/calendar/feed";
import { decryptSecret } from "@/lib/crypto";
import { GET, PUT } from "./route";

const URL_OK = "https://timewarp.innoq.io/export/geheim/calendar.ics";
const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:a",
  "DTSTART;VALUE=DATE:20261221",
  "DTEND;VALUE=DATE:20261224",
  "SUMMARY:Max Muster: URLAUB",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:b",
  "STATUS:CANCELLED",
  "DTSTART;VALUE=DATE:20261201",
  "SUMMARY:Max Muster: URLAUB",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:c",
  "DTSTART;VALUE=DATE:20261105",
  "DTEND;VALUE=DATE:20261105",
  "SUMMARY:Max Muster: Event in Köln",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

function put(body: unknown) {
  return PUT(
    new Request("http://localhost/api/calendar/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.prisma.calendarIntegration.findUnique.mockResolvedValue(null);
  mocks.prisma.timingIntegration.findUnique.mockResolvedValue({
    apiTokenEnc: "enc",
  });
  mocks.prisma.calendarIntegration.upsert.mockImplementation(
    async ({ create }: { create: Record<string, unknown> }) => ({
      id: "c1",
      syncEnabled: false,
      writeToTiming: true,
      timingProjectId: null,
      lastSyncAt: null,
      lastSyncStatus: null,
      lastSyncError: null,
      lastSyncStats: null,
      feedUrlEnc: null,
      ...create,
    }),
  );
  mocks.fetchCalendarFeed.mockResolvedValue(ICS);
});

describe("GET /api/calendar/settings", () => {
  it("verlangt eine Anmeldung", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("liefert Standardwerte ohne Integration", async () => {
    const response = await GET();
    expect(await response.json()).toMatchObject({
      configured: false,
      feedHost: null,
      syncEnabled: false,
      writeToTiming: true,
      timingConnected: true,
    });
  });
});

describe("PUT /api/calendar/settings", () => {
  it("prüft die Feed-URL per Testabruf, speichert verschlüsselt und zeigt nur den Host", async () => {
    const response = await put({
      feedUrl: URL_OK,
      syncEnabled: true,
      timingProjectId: "/projects/7",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.test).toEqual({
      absences: 1,
      cancelled: 1,
      events: 1,
      unknownTypes: [],
    });
    expect(body.settings).toMatchObject({
      configured: true,
      feedHost: "timewarp.innoq.io",
      syncEnabled: true,
      timingProjectId: "/projects/7",
    });
    expect(JSON.stringify(body)).not.toContain("geheim");
    const saved =
      mocks.prisma.calendarIntegration.upsert.mock.calls[0][0].create;
    expect(decryptSecret(saved.feedUrlEnc)).toBe(URL_OK);
  });

  it("lehnt fremde Hosts ab, ohne abzurufen", async () => {
    const response = await put({ feedUrl: "https://evil.example.test/x.ics" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/nicht erlaubt/);
    expect(mocks.prisma.calendarIntegration.upsert).not.toHaveBeenCalled();
  });

  it("meldet Fehler des Testabrufs auf Deutsch und speichert nichts", async () => {
    mocks.fetchCalendarFeed.mockRejectedValue(
      new CalendarFeedError(
        "HTTP",
        "Der Kalender-Feed antwortet mit HTTP 403.",
        403,
      ),
    );
    const response = await put({ feedUrl: URL_OK });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Der Kalender-Feed antwortet mit HTTP 403.",
    });
    expect(mocks.prisma.calendarIntegration.upsert).not.toHaveBeenCalled();
  });

  it("meldet einen Feed, der kein iCalendar ist", async () => {
    mocks.fetchCalendarFeed.mockResolvedValue("<html>Login</html>");
    const response = await put({ feedUrl: URL_OK });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/iCalendar/);
  });

  it("verlangt eine Feed-URL für den automatischen Abgleich", async () => {
    const response = await put({ syncEnabled: true });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Feed-URL/);
  });

  it("löscht die Feed-URL und schaltet den Abgleich ab", async () => {
    mocks.prisma.calendarIntegration.findUnique.mockResolvedValue({
      feedUrlEnc: "alt",
    });
    expect((await put({ feedUrl: null, syncEnabled: true })).status).toBe(400);
    await put({ feedUrl: null });
    expect(
      mocks.prisma.calendarIntegration.upsert.mock.calls[0][0].update,
    ).toEqual({ feedUrlEnc: null, syncEnabled: false });
  });

  it("validiert die Eingabe", async () => {
    expect((await put({ timingProjectId: "Urlaub" })).status).toBe(400);
    const wrongType = await put({ writeToTiming: "ja" });
    expect(wrongType.status).toBe(400);
    expect((await wrongType.json()).error).toMatch(/an oder aus/);
    const unknown = await put({ feedUrlEnc: "x" });
    expect((await unknown.json()).error).toBe(
      "Unbekannte Einstellung: feedUrlEnc",
    );
    const cleared = await put({ timingProjectId: "", writeToTiming: false });
    expect(cleared.status).toBe(200);
    expect(
      mocks.prisma.calendarIntegration.upsert.mock.calls[0][0].update,
    ).toEqual({ writeToTiming: false, timingProjectId: null });
  });
});
