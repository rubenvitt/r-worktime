import { describe, expect, it, vi } from "vitest";
import {
  createTimingClient,
  splitIntoMonthChunks,
  TimingApiError,
  type TimingApiTimeEntry,
} from "./client";

const BASE = "https://timing.example.test/api/v1";

function apiEntry(
  id: string,
  overrides: Partial<TimingApiTimeEntry> = {},
): TimingApiTimeEntry {
  return {
    self: `/time-entries/${id}`,
    start_date: "2026-03-02T09:00:00.000000+01:00",
    end_date: "2026-03-02T10:00:00.000000+01:00",
    duration: 3600,
    project: {
      self: "/projects/1",
      title: "Kunde A",
      title_chain: ["Work", "Firma", "Kunde A"],
    },
    title: "Alpha | 101: Backend",
    notes: null,
    is_running: false,
    billing_status: "billable",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("splitIntoMonthChunks", () => {
  it("teilt an Monatsgrenzen ohne Überlappung", () => {
    expect(
      splitIntoMonthChunks({ from: "2026-01-15", to: "2026-03-10" }),
    ).toEqual([
      { from: "2026-01-15", to: "2026-01-31" },
      { from: "2026-02-01", to: "2026-02-28" },
      { from: "2026-03-01", to: "2026-03-10" },
    ]);
  });

  it("liefert einen Abschnitt innerhalb eines Monats", () => {
    expect(
      splitIntoMonthChunks({ from: "2026-10-01", to: "2026-10-01" }),
    ).toEqual([{ from: "2026-10-01", to: "2026-10-01" }]);
  });

  it("geht über den Jahreswechsel", () => {
    expect(
      splitIntoMonthChunks({ from: "2025-12-20", to: "2026-01-05" }),
    ).toEqual([
      { from: "2025-12-20", to: "2025-12-31" },
      { from: "2026-01-01", to: "2026-01-05" },
    ]);
  });

  it("lehnt umgedrehte Zeiträume ab", () => {
    expect(() =>
      splitIntoMonthChunks({ from: "2026-02-01", to: "2026-01-01" }),
    ).toThrow(RangeError);
  });
});

describe("createTimingClient", () => {
  it("setzt Auth-, Accept- und Zeitzonen-Header und fragt Projektdaten an", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [], links: { next: null } }),
    );
    const client = createTimingClient({
      token: "synthetic-token",
      baseUrl: BASE,
      fetchImpl,
    });

    await client.listTimeEntries({ from: "2026-03-01", to: "2026-03-31" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(`${BASE}/time-entries`);
    expect(parsed.searchParams.get("start_date_min")).toBe("2026-03-01");
    expect(parsed.searchParams.get("start_date_max")).toBe("2026-03-31");
    expect(parsed.searchParams.get("include_project_data")).toBe("1");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer synthetic-token");
    expect(headers.Accept).toBe("application/json");
    expect(headers["X-Time-Zone"]).toBe("Europe/Berlin");
  });

  it("folgt links.next und dedupliziert nach self", async () => {
    const pages: Record<string, unknown> = {
      first: {
        data: [
          apiEntry("1234567890123456744"),
          apiEntry("1234567890123456745"),
        ],
        links: { next: `${BASE}/time-entries?page=2` },
      },
      second: {
        data: [
          apiEntry("1234567890123456745"),
          apiEntry("1234567890123456746"),
        ],
        links: { next: null },
      },
    };
    const fetchImpl = vi.fn(async (url: string) =>
      jsonResponse(url.includes("page=2") ? pages.second : pages.first),
    );
    const client = createTimingClient({
      token: "t",
      baseUrl: BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const entries = await client.listTimeEntries({
      from: "2026-03-01",
      to: "2026-03-31",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(entries.map((e) => e.self)).toEqual([
      "/time-entries/1234567890123456744",
      "/time-entries/1234567890123456745",
      "/time-entries/1234567890123456746",
    ]);
  });

  it("löst relative next-Links gegen die Basis-URL auf", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("page=2")
        ? jsonResponse({ data: [apiEntry("2")], links: { next: null } })
        : jsonResponse({
            data: [apiEntry("1")],
            links: { next: "/api/v1/time-entries?page=2" },
          }),
    );
    const client = createTimingClient({
      token: "t",
      baseUrl: BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const entries = await client.listTimeEntries({
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(entries).toHaveLength(2);
    expect(fetchImpl.mock.calls[1][0]).toBe(`${BASE}/time-entries?page=2`);
  });

  it("schickt den Token nie an einen fremden Host aus links.next", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("page=2")
        ? jsonResponse({ data: [apiEntry("2")], links: { next: null } })
        : jsonResponse({
            data: [apiEntry("1")],
            links: {
              next: "https://other-host.test/api/v1/time-entries?page=2",
            },
          }),
    );
    const client = createTimingClient({
      token: "t",
      baseUrl: BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const entries = await client.listTimeEntries({
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(entries).toHaveLength(2);
    const urls = fetchImpl.mock.calls.map((call) => new URL(call[0]).origin);
    expect(urls).toEqual([
      "https://timing.example.test",
      "https://timing.example.test",
    ]);
  });

  it("bricht bei endloser Paginierung ab", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [],
        links: { next: `${BASE}/time-entries?page=1` },
      }),
    );
    const client = createTimingClient({ token: "t", baseUrl: BASE, fetchImpl });
    await expect(
      client.listTimeEntries({ from: "2026-03-01", to: "2026-03-31" }),
    ).rejects.toThrow(/Paginierung/);
  });

  it("fragt pro Monat einen Abschnitt ab", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [], links: {} }));
    const client = createTimingClient({ token: "t", baseUrl: BASE, fetchImpl });

    await client.listTimeEntries({ from: "2026-01-20", to: "2026-03-05" });

    const ranges = fetchImpl.mock.calls.map((call) => {
      const params = new URL((call as unknown as [string])[0]).searchParams;
      return [params.get("start_date_min"), params.get("start_date_max")];
    });
    expect(ranges).toEqual([
      ["2026-01-20", "2026-01-31"],
      ["2026-02-01", "2026-02-28"],
      ["2026-03-01", "2026-03-05"],
    ]);
  });

  it("meldet 401 als ungültigen Token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "nope" }, 401));
    const client = createTimingClient({ token: "t", baseUrl: BASE, fetchImpl });

    const error = await client
      .listTimeEntries({ from: "2026-03-01", to: "2026-03-31" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimingApiError);
    expect((error as TimingApiError).code).toBe("UNAUTHORIZED");
    expect((error as TimingApiError).message).toMatch(/Token ungültig/);
  });

  it("meldet 429 als Rate-Limit", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429));
    const client = createTimingClient({ token: "t", baseUrl: BASE, fetchImpl });

    const error = await client.testConnection().catch((e: unknown) => e);
    expect((error as TimingApiError).code).toBe("RATE_LIMITED");
  });

  it("meldet Netzwerkfehler ohne Token im Text", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = createTimingClient({
      token: "secret-value",
      baseUrl: BASE,
      fetchImpl,
    });
    const error = await client.testConnection().catch((e: unknown) => e);
    expect((error as TimingApiError).code).toBe("NETWORK_ERROR");
    expect((error as Error).message).not.toContain("secret-value");
  });

  it("testConnection zählt Projekte", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [{ self: "/projects/1" }, { self: "/projects/2" }],
      }),
    );
    const client = createTimingClient({ token: "t", baseUrl: BASE, fetchImpl });

    await expect(client.testConnection()).resolves.toEqual({ projectCount: 2 });
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe("/api/v1/projects");
    expect(url.searchParams.get("hide_archived")).toBe("1");
  });

  it("verlangt einen Token", () => {
    expect(() => createTimingClient({ token: "  ", baseUrl: BASE })).toThrow(
      TimingApiError,
    );
  });
});

describe("createTimingClient – Schreiben und Projekte", () => {
  function clientWith(fetchImpl: ReturnType<typeof vi.fn>) {
    return createTimingClient({
      token: "t",
      baseUrl: BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  }

  it("listTimeEntries filtert nach Projekt samt Unterprojekten, auch in der Zukunft", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [apiEntry("1")], links: { next: null } }),
    );
    await clientWith(fetchImpl).listTimeEntries(
      { from: "2027-01-04", to: "2027-01-05" },
      { projects: ["/projects/42"], includeChildProjects: true },
    );
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.getAll("projects[]")).toEqual(["/projects/42"]);
    expect(url.searchParams.get("include_child_projects")).toBe("1");
    expect(url.searchParams.get("start_date_min")).toBe("2027-01-04");
    expect(url.searchParams.get("start_date_max")).toBe("2027-01-05");
  });

  it("createTimeEntry schickt Ortszeit mit Offset und nicht abrechenbar", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: apiEntry("99") }, 201),
    );
    const created = await clientWith(fetchImpl).createTimeEntry({
      start: new Date("2026-12-21T07:00:00.000Z"),
      end: new Date("2026-12-21T15:00:00.000Z"),
      projectRef: "/projects/42",
      title: "Urlaub",
      notes: "Aus Timewarp",
    });
    expect(created.self).toBe("/time-entries/99");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(`${BASE}/time-entries`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      start_date: "2026-12-21T08:00:00+01:00",
      end_date: "2026-12-21T16:00:00+01:00",
      project: "/projects/42",
      title: "Urlaub",
      notes: "Aus Timewarp",
      billing_status: "not_billable",
      replace_existing: false,
    });
  });

  it("createTimeEntry akzeptiert die Antwort auch ohne data-Hülle", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(apiEntry("7"), 201));
    const created = await clientWith(fetchImpl).createTimeEntry({
      start: new Date("2026-12-21T07:00:00.000Z"),
      end: new Date("2026-12-21T15:00:00.000Z"),
      projectRef: "/projects/42",
      title: "Urlaub",
    });
    expect(created.self).toBe("/time-entries/7");
  });

  it("createTimeEntry wirft bei Fehlern und Antworten ohne ID", async () => {
    const failing = vi.fn(async () => jsonResponse({ message: "nope" }, 422));
    const error = await clientWith(failing)
      .createTimeEntry({
        start: new Date(),
        end: new Date(),
        projectRef: "/projects/42",
        title: "Urlaub",
      })
      .catch((e: unknown) => e);
    expect((error as TimingApiError).status).toBe(422);

    const noId = vi.fn(async () => jsonResponse({ data: {} }, 201));
    await expect(
      clientWith(noId).createTimeEntry({
        start: new Date(),
        end: new Date(),
        projectRef: "/projects/42",
        title: "Urlaub",
      }),
    ).rejects.toThrow(/keine ID/);

    const neverCalled = vi.fn();
    await expect(
      clientWith(neverCalled).createTimeEntry({
        start: new Date(),
        end: new Date(),
        projectRef: "https://evil.example.test/projects/1",
        title: "Urlaub",
      }),
    ).rejects.toThrow(TimingApiError);
    expect(neverCalled).not.toHaveBeenCalled();
  });

  it("deleteTimeEntry: 204 und 404 gelten als gelöscht, sonst Fehler", async () => {
    const ok = vi.fn(async () => new Response(null, { status: 204 }));
    await clientWith(ok).deleteTimeEntry("/time-entries/5");
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/time-entries/5`);
    expect(init.method).toBe("DELETE");

    const gone = vi.fn(async () => new Response(null, { status: 404 }));
    await expect(
      clientWith(gone).deleteTimeEntry("/time-entries/5"),
    ).resolves.toBeUndefined();

    const broken = vi.fn(async () => new Response(null, { status: 500 }));
    await expect(
      clientWith(broken).deleteTimeEntry("/time-entries/5"),
    ).rejects.toThrow(TimingApiError);
  });

  it("deleteTimeEntry lehnt fremde Referenzen ab, ohne anzufragen", async () => {
    const fetchImpl = vi.fn();
    await expect(
      clientWith(fetchImpl).deleteTimeEntry("//evil.example.test/x"),
    ).rejects.toThrow(TimingApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("listProjects liefert Referenz und Pfad, sortiert", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { self: "/projects/2", title_chain: ["Work", "INNOQ", "Urlaub"] },
          { self: "/projects/1", title: "Privat" },
          { self: "kaputt" },
        ],
      }),
    );
    await expect(clientWith(fetchImpl).listProjects()).resolves.toEqual([
      { self: "/projects/1", path: "Privat" },
      { self: "/projects/2", path: "Work ▸ INNOQ ▸ Urlaub" },
    ]);
  });
});
