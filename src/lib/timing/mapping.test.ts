import { describe, expect, it } from "vitest";
import type { TimingApiTimeEntry } from "./client";
import { filterAndMapEntries, mapApiEntry } from "./mapping";

function apiEntry(
  overrides: Partial<TimingApiTimeEntry> = {},
): TimingApiTimeEntry {
  return {
    self: "/time-entries/1234567890123456744",
    start_date: "2026-03-02T09:00:00.000000+01:00",
    end_date: "2026-03-02T10:30:00.000000+01:00",
    duration: 5400,
    project: {
      self: "/projects/1",
      title: "Kunde A",
      title_chain: ["Work", "Firma", "Kunde A"],
    },
    title: "Alpha | 101: Backend",
    notes: "Endpoint gebaut",
    is_running: false,
    billing_status: "billable",
    ...overrides,
  };
}

function withChain(chain: string[] | undefined) {
  return apiEntry({
    project: { self: "/projects/9", title_chain: chain },
  });
}

describe("mapApiEntry", () => {
  it("bildet einen Eintrag vollständig ab", () => {
    const result = mapApiEntry(apiEntry(), ["Work"]);
    expect(result).toEqual({
      kept: true,
      entry: {
        externalId: "/time-entries/1234567890123456744",
        dateKey: "2026-03-02",
        startTime: new Date("2026-03-02T08:00:00.000Z"),
        endTime: new Date("2026-03-02T09:30:00.000Z"),
        duration: 1.5,
        type: "WORK",
        description: "Alpha | 101: Backend - Endpoint gebaut",
        title: "Alpha | 101: Backend",
        notes: "Endpoint gebaut",
        projectPath: "Work ▸ Firma ▸ Kunde A",
        billingStatus: "billable",
      },
    });
  });

  it("behält die externalId als String (größer als MAX_SAFE_INTEGER)", () => {
    const result = mapApiEntry(
      apiEntry({ self: "/time-entries/9007199254740993123" }),
      ["Work"],
    );
    expect(result.kept && result.entry.externalId).toBe(
      "/time-entries/9007199254740993123",
    );
  });

  it("filtert per exaktem Segmentvergleich auf die Wurzel", () => {
    expect(mapApiEntry(withChain(["Work"]), ["Work"]).kept).toBe(true);
    expect(mapApiEntry(withChain(["Work", "Kunde A"]), ["Work"]).kept).toBe(
      true,
    );
    expect(mapApiEntry(withChain(["Workshop", "Basteln"]), ["Work"])).toEqual({
      kept: false,
      reason: "outsideRoots",
    });
    expect(mapApiEntry(withChain(["Privat", "Work"]), ["Work"]).kept).toBe(
      false,
    );
  });

  it("unterstützt mehrteilige und mehrere Wurzeln", () => {
    const roots = ["Work ▸ Firma ▸ Kunde A", "Verein"];
    expect(
      mapApiEntry(withChain(["Work", "Firma", "Kunde A", "X"]), roots).kept,
    ).toBe(true);
    expect(
      mapApiEntry(withChain(["Work", "Firma", "Kunde B"]), roots).kept,
    ).toBe(false);
    expect(mapApiEntry(withChain(["Verein"]), roots).kept).toBe(true);
  });

  it("verwirft Einträge ohne Projekt", () => {
    expect(mapApiEntry(apiEntry({ project: null }), ["Work"])).toEqual({
      kept: false,
      reason: "noProject",
    });
    expect(mapApiEntry(withChain(undefined), ["Work"])).toEqual({
      kept: false,
      reason: "noProject",
    });
    expect(mapApiEntry(withChain([]), ["Work"])).toEqual({
      kept: false,
      reason: "noProject",
    });
  });

  it("verwirft laufende Einträge", () => {
    expect(
      mapApiEntry(apiEntry({ is_running: true, end_date: null }), ["Work"]),
    ).toEqual({ kept: false, reason: "running" });
  });

  it("ordnet 00:30 Berlin dem Berliner Tag zu, nicht dem UTC-Vortag", () => {
    // Winterzeit: 00:30 MEZ = 23:30 UTC am Vortag
    const winter = mapApiEntry(
      apiEntry({
        start_date: "2026-03-09T23:30:00.000000+00:00",
        end_date: "2026-03-10T00:30:00.000000+00:00",
      }),
      ["Work"],
    );
    expect(winter.kept && winter.entry.dateKey).toBe("2026-03-10");

    // Sommerzeit: 00:30 MESZ = 22:30 UTC am Vortag
    const summer = mapApiEntry(
      apiEntry({
        start_date: "2026-07-14T22:30:00.000000+00:00",
        end_date: "2026-07-14T23:30:00.000000+00:00",
      }),
      ["Work"],
    );
    expect(summer.kept && summer.entry.dateKey).toBe("2026-07-15");
  });

  it("rundet die Dauer auf zwei Nachkommastellen", () => {
    const result = mapApiEntry(apiEntry({ duration: 1000 }), ["Work"]);
    expect(result.kept && result.entry.duration).toBe(0.28);
  });

  it("berechnet die Dauer aus Start und Ende, wenn sie fehlt", () => {
    const result = mapApiEntry(apiEntry({ duration: null }), ["Work"]);
    expect(result.kept && result.entry.duration).toBe(1.5);
  });

  it("leitet den Typ aus dem Projektpfad ab", () => {
    const result = mapApiEntry(withChain(["Work", "Urlaub"]), ["Work"]);
    expect(result.kept && result.entry.type).toBe("VACATION");
  });

  it("setzt leere Titel und Notizen auf null", () => {
    const result = mapApiEntry(apiEntry({ title: "  ", notes: "" }), ["Work"]);
    expect(result.kept && result.entry).toMatchObject({
      title: null,
      notes: null,
      description: null,
    });
  });
});

describe("filterAndMapEntries", () => {
  it("zählt behaltene und verworfene Einträge", () => {
    const { entries, stats } = filterAndMapEntries(
      [
        apiEntry(),
        withChain(["Workshop"]),
        apiEntry({ project: null }),
        apiEntry({ is_running: true, end_date: null }),
      ],
      ["Work"],
    );
    expect(entries).toHaveLength(1);
    expect(stats).toEqual({
      fetched: 4,
      kept: 1,
      skipped: { running: 1, noProject: 1, outsideRoots: 1, invalid: 0 },
    });
  });
});
