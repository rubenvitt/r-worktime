import { describe, expect, it } from "vitest";
import type { PublicCalendarSettings } from "@/lib/calendar/types";
import {
  actionLabel,
  deriveCalendarSyncState,
  formatActionDate,
  formatFeedTest,
  kindLabel,
  maskedFeedUrl,
  projectOutsideRoots,
  sortActions,
  statsRows,
  suggestVacationProject,
  summarizeActions,
} from "./calendar-format";

const baseSettings: PublicCalendarSettings = {
  configured: true,
  feedHost: "timewarp.innoq.io",
  syncEnabled: true,
  writeToTiming: true,
  timingProjectId: "p1",
  timingConnected: true,
  lastSyncAt: "2026-10-11T08:00:00Z",
  lastSyncStatus: "success",
  lastSyncError: null,
  lastSyncStats: null,
};

describe("Aktionen", () => {
  it("beschriftet bekannte Aktionen deutsch und lässt unbekannte stehen", () => {
    expect(actionLabel("timingCreated")).toBe("In Timing eingetragen");
    expect(actionLabel("skippedUnknownType")).toBe(
      "Unbekannter Typ übersprungen",
    );
    expect(actionLabel("somethingNew")).toBe("somethingNew");
  });

  it("zählt Aktionen eines Laufs in fester Reihenfolge", () => {
    expect(
      summarizeActions([
        {
          date: "2026-10-13",
          kind: "VACATION",
          action: "timingCreated",
          detail: "",
        },
        {
          date: "2026-10-12",
          kind: "VACATION",
          action: "created",
          detail: "",
        },
        {
          date: "2026-10-13",
          kind: "VACATION",
          action: "created",
          detail: "",
        },
        {
          date: "2027-03-01",
          kind: "EVENT",
          action: "skippedUnknownType",
          detail: "",
        },
      ]),
    ).toBe(
      "2 angelegt · 1 in Timing eingetragen · 1 übersprungen (unbekannter Typ)",
    );
    expect(summarizeActions([])).toBe("");
  });

  it("sortiert Aktionen nach Datum", () => {
    const sorted = sortActions([
      { date: "2027-03-01", kind: "WORKATION", action: "failed", detail: "" },
      { date: "2026-10-13", kind: "VACATION", action: "created", detail: "" },
      { date: "2026-10-12", kind: "VACATION", action: "created", detail: "" },
    ]);
    expect(sorted.map((a) => a.date)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2027-03-01",
    ]);
  });

  it("formatiert Datum und Art", () => {
    expect(formatActionDate("2026-10-12")).toBe("Mo 12.10.2026");
    expect(formatActionDate(null)).toBeNull();
    expect(kindLabel("OVERTIME_REDUCTION")).toBe("Überstundenabbau");
    expect(kindLabel("HOMEOFFICE")).toBe("HOMEOFFICE");
  });
});

describe("Feed", () => {
  it("meldet das Testergebnis als Satz", () => {
    expect(
      formatFeedTest({
        absences: 3,
        cancelled: 1,
        events: 21,
        unknownTypes: [],
      }),
    ).toBe(
      "3 Abwesenheiten (dazu 1 stornierte), 21 Events, 0 unbekannte Typen",
    );
    expect(
      formatFeedTest({
        absences: 1,
        cancelled: 0,
        events: 1,
        unknownTypes: ["HOMEOFFICE"],
      }),
    ).toBe("1 Abwesenheit, 1 Event, 1 unbekannter Typ");
  });

  it("zeigt von der URL nur den Host", () => {
    expect(maskedFeedUrl("timewarp.innoq.io")).toBe(
      "https://timewarp.innoq.io/…",
    );
  });

  it("schlägt das erste Projekt mit Urlaub im Pfad vor", () => {
    expect(
      suggestVacationProject([
        { id: "1", path: "Work ▸ INNOQ ▸ Kunde" },
        { id: "2", path: "Work ▸ INNOQ ▸ Urlaub" },
        { id: "3", path: "Privat ▸ Urlaub" },
      ]),
    ).toEqual({ id: "2", path: "Work ▸ INNOQ ▸ Urlaub" });
    expect(suggestVacationProject([{ id: "1", path: "Work" }])).toBeNull();
  });
});

describe("deriveCalendarSyncState", () => {
  const now = new Date("2026-10-11T10:00:00Z");

  it("unterscheidet die Zustände", () => {
    expect(
      deriveCalendarSyncState(
        { ...baseSettings, configured: false },
        false,
        now,
      ),
    ).toBe("not-configured");
    expect(deriveCalendarSyncState(baseSettings, true, now)).toBe("running");
    expect(
      deriveCalendarSyncState(
        { ...baseSettings, lastSyncStatus: "error" },
        false,
        now,
      ),
    ).toBe("failed");
    expect(
      deriveCalendarSyncState(
        { ...baseSettings, lastSyncAt: null },
        false,
        now,
      ),
    ).toBe("never");
    expect(
      deriveCalendarSyncState(
        { ...baseSettings, lastSyncAt: "2026-10-09T08:00:00Z" },
        false,
        now,
      ),
    ).toBe("stale");
    expect(deriveCalendarSyncState(baseSettings, false, now)).toBe("ok");
  });
});

describe("statsRows", () => {
  it("liest nur beschriftete Zahlen und Listen", () => {
    expect(
      statsRows({
        created: 2,
        failed: 0,
        unknownTypes: ["X"],
        durationMs: 120,
        note: "egal",
      }),
    ).toEqual([
      ["Angelegt", 2],
      ["Fehlgeschlagen", 0],
      ["Unbekannte Typen", 1],
    ]);
    expect(statsRows(null)).toEqual([]);
    expect(statsRows([1, 2])).toEqual([]);
  });
});

describe("projectOutsideRoots", () => {
  it("meldet ein Urlaubsprojekt außerhalb der Wurzeln des Timing-Syncs", () => {
    expect(projectOutsideRoots("Work ▸ INNOQ ▸ Urlaub", ["Work"])).toBe(false);
    expect(projectOutsideRoots("Privat ▸ Urlaub", ["Work"])).toBe(true);
    expect(projectOutsideRoots("Workshop ▸ Urlaub", ["Work"])).toBe(true);
    expect(projectOutsideRoots("Work ▸ INNOQ ▸ Urlaub", [])).toBe(true);
  });
});
