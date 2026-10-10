import { describe, expect, it } from "vitest";
import {
  buildProjectsReport,
  buildProjectTree,
  buildProjectTrend,
  defaultExpandedIds,
  entryMinutes,
  findFocusLevel,
  formatShare,
  isCountedProjectEntry,
  type ProjectSourceEntry,
  periodFileName,
  projectTreeToCsv,
  reportLoadRange,
  summarizeProjectEntries,
  toProjectRecords,
  UNASSIGNED_ID,
  UNASSIGNED_LABEL,
} from "./projects";

// Zeitstempel mit explizitem Offset, damit die Rechner-Zeitzone keine Rolle spielt.
function entry(
  start: string,
  end: string,
  projectPath: string | null,
  overrides: Partial<ProjectSourceEntry> = {},
): ProjectSourceEntry {
  return {
    startTime: new Date(start),
    endTime: new Date(end),
    duration: null,
    type: "WORK",
    source: "TIMING_SYNC",
    projectPath,
    ...overrides,
  };
}

describe("Dateiname", () => {
  it("benennt die CSV nach dem Zeitraum", () => {
    expect(periodFileName({ kind: "quarter", key: "2026-Q4" })).toBe(
      "projekte-2026-Q4.csv",
    );
  });
});

describe("Filter und Minuten", () => {
  it("zählt nur echte Arbeit: WORK ohne Saldo und Feiertagsimport", () => {
    const base = entry(
      "2026-10-05T09:00:00+02:00",
      "2026-10-05T10:00:00+02:00",
      "Work",
    );
    expect(isCountedProjectEntry(base)).toBe(true);
    expect(isCountedProjectEntry({ ...base, source: "BULK_FILL" })).toBe(true);
    expect(isCountedProjectEntry({ ...base, source: "MANUAL" })).toBe(true);
    expect(isCountedProjectEntry({ ...base, type: "VACATION" })).toBe(false);
    expect(isCountedProjectEntry({ ...base, type: "SICK" })).toBe(false);
    expect(isCountedProjectEntry({ ...base, type: "HOLIDAY" })).toBe(false);
    // OVERTIME ist ausschließlich die Saldo-Buchung
    expect(isCountedProjectEntry({ ...base, type: "OVERTIME" })).toBe(false);
    expect(isCountedProjectEntry({ ...base, source: "ADJUSTMENT" })).toBe(
      false,
    );
    expect(isCountedProjectEntry({ ...base, source: "HOLIDAY" })).toBe(false);
    // Altdaten: Saldo nur am Text erkennbar
    expect(
      isCountedProjectEntry({
        ...base,
        source: "MANUAL",
        description: "Anfangs-Überstunden-Saldo (Import)",
      }),
    ).toBe(false);
  });

  it("rechnet Minuten aus Start/Ende, sonst aus duration", () => {
    expect(
      entryMinutes(
        entry("2026-10-05T09:00:00+02:00", "2026-10-05T10:30:00+02:00", null),
      ),
    ).toBe(90);
    expect(
      entryMinutes(
        entry("2026-10-05T09:00:00+02:00", "2026-10-05T09:00:00+02:00", null, {
          duration: 1.25,
        }),
      ),
    ).toBe(75);
    expect(
      entryMinutes(
        entry("2026-10-05T09:00:00+02:00", "invalid", null, { duration: null }),
      ),
    ).toBe(0);
  });

  it("ordnet nach dem Berliner Tag des Starts zu", () => {
    // 31.10. 23:30 UTC = 01.11. 00:30 Berlin (Winterzeit)
    const [record] = toProjectRecords([
      entry("2026-10-31T23:30:00Z", "2026-11-01T00:30:00Z", "Work ▸ A"),
    ]);
    expect(record.monthKey).toBe("2026-11");
    expect(record.segments).toEqual(["Work", "A"]);
  });

  it("behandelt leere und reine Leerzeichen-Pfade als ohne Projekt", () => {
    const records = toProjectRecords([
      entry("2026-10-05T09:00:00+02:00", "2026-10-05T10:00:00+02:00", ""),
      entry("2026-10-05T10:00:00+02:00", "2026-10-05T11:00:00+02:00", "   "),
      entry("2026-10-05T11:00:00+02:00", "2026-10-05T12:00:00+02:00", null),
    ]);
    expect(records.every((r) => r.segments.length === 0)).toBe(true);
  });

  it("fasst Aufgefülltes und Ohne Projekt für Hinweise zusammen", () => {
    const records = toProjectRecords([
      entry("2026-10-05T09:00:00+02:00", "2026-10-05T17:00:00+02:00", null, {
        source: "BULK_FILL",
      }),
      entry("2026-10-06T09:00:00+02:00", "2026-10-06T10:00:00+02:00", null),
      entry("2026-10-06T10:00:00+02:00", "2026-10-06T12:00:00+02:00", "Work"),
      entry("2026-10-06T12:00:00+02:00", "2026-10-06T13:00:00+02:00", "Work", {
        type: "VACATION",
      }),
    ]);
    expect(summarizeProjectEntries(records)).toEqual({
      totalMinutes: 660,
      entries: 3,
      unassignedMinutes: 540,
      bulkFillMinutes: 480,
    });
  });
});

describe("Projektbaum", () => {
  const items = [
    { segments: ["Work", "Kunde A", "Entwicklung"], minutes: 300 },
    { segments: ["Work", "Kunde A", "Meetings"], minutes: 60 },
    { segments: ["Work", "Kunde A"], minutes: 30 },
    { segments: ["Work", "Intern"], minutes: 90 },
    { segments: [], minutes: 120 },
    { segments: ["Privat"], minutes: 0 },
  ];

  it("summiert Teilbäume und hält eigene Minuten getrennt", () => {
    const tree = buildProjectTree(items);
    expect(tree.totalMinutes).toBe(600);
    const work = tree.nodes[0];
    expect(work.name).toBe("Work");
    expect(work.totalMinutes).toBe(480);
    expect(work.ownMinutes).toBe(0);
    const kundeA = work.children[0];
    expect(kundeA.id).toBe("Work ▸ Kunde A");
    expect(kundeA.totalMinutes).toBe(390);
    expect(kundeA.ownMinutes).toBe(30);
    expect(kundeA.depth).toBe(1);
    expect(kundeA.children.map((c) => c.name)).toEqual([
      "Entwicklung",
      "Meetings",
    ]);
  });

  it("rechnet den Anteil am Gesamtvolumen, nicht am Elternknoten", () => {
    const tree = buildProjectTree(items);
    const meetings = tree.nodes[0].children[0].children[1];
    expect(meetings.share).toBeCloseTo(60 / 600);
  });

  it("stellt Ohne Projekt ans Ende, auch wenn es größer ist", () => {
    const tree = buildProjectTree([
      { segments: ["B"], minutes: 10 },
      { segments: [], minutes: 500 },
      { segments: ["A"], minutes: 10 },
    ]);
    expect(tree.nodes.map((n) => n.id)).toEqual(["A", "B", UNASSIGNED_ID]);
    const unassigned = tree.nodes[2];
    expect(unassigned.name).toBe(UNASSIGNED_LABEL);
    expect(unassigned.unassigned).toBe(true);
  });

  it("lässt ein echtes Projekt namens „Ohne Projekt“ nicht kollidieren", () => {
    const tree = buildProjectTree([
      { segments: ["Ohne Projekt"], minutes: 10 },
      { segments: [], minutes: 20 },
    ]);
    expect(tree.nodes).toHaveLength(2);
    expect(new Set(tree.nodes.map((n) => n.id)).size).toBe(2);
  });

  it("sortiert nach Minuten absteigend, bei Gleichstand nach Name", () => {
    const tree = buildProjectTree([
      { segments: ["Zeta"], minutes: 60 },
      { segments: ["Alpha"], minutes: 60 },
      { segments: ["Mitte"], minutes: 120 },
    ]);
    expect(tree.nodes.map((n) => n.name)).toEqual(["Mitte", "Alpha", "Zeta"]);
  });

  it("lässt Knoten ohne Minuten weg und kommt mit leerer Eingabe klar", () => {
    expect(buildProjectTree([])).toEqual({ totalMinutes: 0, nodes: [] });
    const tree = buildProjectTree(items);
    expect(tree.nodes.some((n) => n.name === "Privat")).toBe(false);
  });

  it("klappt Ketten mit nur einem Kind automatisch auf", () => {
    const tree = buildProjectTree([
      { segments: ["Work", "Firma", "Kunde A", "Dev"], minutes: 100 },
      { segments: ["Work", "Firma", "Intern"], minutes: 50 },
      { segments: [], minutes: 10 },
    ]);
    expect(defaultExpandedIds(tree)).toEqual(["Work", "Work ▸ Firma"]);
  });

  it("klappt nichts auf, wenn oben schon verzweigt wird", () => {
    const tree = buildProjectTree([
      { segments: ["A", "x"], minutes: 10 },
      { segments: ["B", "y"], minutes: 10 },
    ]);
    expect(defaultExpandedIds(tree)).toEqual([]);
  });
});

describe("Fokusebene", () => {
  it("steigt durch Ketten mit einem Kind bis zur ersten Verzweigung ab", () => {
    const tree = buildProjectTree([
      { segments: ["Work", "Firma", "Kunde A", "Dev"], minutes: 100 },
      { segments: ["Work", "Firma", "Intern"], minutes: 50 },
      { segments: [], minutes: 10 },
    ]);
    const focus = findFocusLevel(tree);
    expect(focus.path).toEqual(["Work", "Firma"]);
    expect(focus.nodes.map((n) => n.name)).toEqual(["Kunde A", "Intern"]);
  });

  it("bleibt oben, wenn die oberste Ebene verzweigt", () => {
    const tree = buildProjectTree([
      { segments: ["A", "x"], minutes: 10 },
      { segments: ["B"], minutes: 10 },
    ]);
    expect(findFocusLevel(tree).path).toEqual([]);
  });

  it("stoppt an einem Blatt", () => {
    const tree = buildProjectTree([
      { segments: ["Work", "Firma"], minutes: 5 },
    ]);
    const focus = findFocusLevel(tree);
    expect(focus.path).toEqual(["Work"]);
    expect(focus.nodes.map((n) => n.name)).toEqual(["Firma"]);
  });
});

describe("Verlauf", () => {
  const months = ["2026-08", "2026-09", "2026-10"];

  it("bildet Top-Projekte der Fokusebene je Monat, Rest in Übrige", () => {
    const records = [
      { monthKey: "2026-08", segments: ["Work", "A"], minutes: 100 },
      { monthKey: "2026-09", segments: ["Work", "A"], minutes: 50 },
      { monthKey: "2026-09", segments: ["Work", "B", "x"], minutes: 80 },
      { monthKey: "2026-10", segments: ["Work", "C"], minutes: 30 },
      { monthKey: "2026-08", segments: ["Work", "D"], minutes: 10 },
      { monthKey: "2026-10", segments: ["Work"], minutes: 15 },
      { monthKey: "2026-10", segments: [], minutes: 20 },
      // außerhalb des Fensters
      { monthKey: "2026-07", segments: ["Work", "Z"], minutes: 999 },
    ].map((r) => ({ ...r, dayKey: `${r.monthKey}-01`, bulkFill: false }));

    const trend = buildProjectTrend(records, months, 2);
    expect(trend.levelPath).toEqual(["Work"]);
    expect(trend.series.map((s) => [s.id, s.kind, s.totalMinutes])).toEqual([
      ["Work ▸ A", "project", 150],
      ["Work ▸ B", "project", 80],
      ["__other__", "other", 55],
      [UNASSIGNED_ID, "unassigned", 20],
    ]);
    expect(trend.rows.map((r) => r.month)).toEqual(months);
    expect(trend.rows[2]).toEqual({
      month: "2026-10",
      total: 65,
      values: {
        "Work ▸ A": 0,
        "Work ▸ B": 0,
        __other__: 45,
        [UNASSIGNED_ID]: 20,
      },
    });
  });

  it("faltet nicht ein einzelnes Projekt in Übrige", () => {
    const records = ["A", "B", "C"].map((name, i) => ({
      monthKey: "2026-10",
      dayKey: "2026-10-01",
      segments: [name],
      minutes: 10 * (i + 1),
      bulkFill: false,
    }));
    const trend = buildProjectTrend(records, months, 2);
    expect(trend.series.map((s) => s.label)).toEqual(["C", "B", "A"]);
  });

  it("liefert leere Reihen ohne Einträge", () => {
    const trend = buildProjectTrend([], months, 5);
    expect(trend.series).toEqual([]);
    expect(trend.rows).toHaveLength(3);
    expect(trend.rows.every((r) => r.total === 0)).toBe(true);
  });
});

describe("CSV und Formatierung", () => {
  it("formatiert Anteile deutsch", () => {
    expect(formatShare(0.4532)).toBe("45,3 %");
    expect(formatShare(1)).toBe("100 %");
    expect(formatShare(0)).toBe("0 %");
    expect(formatShare(0.0004)).toBe("< 0,1 %");
  });

  it("exportiert den Baum mit Semikolon, Dezimalkomma und BOM", () => {
    const tree = buildProjectTree([
      { segments: ["Work", "Kunde; A"], minutes: 90_000 },
      { segments: ["Work", 'Intern "B"'], minutes: 45 },
      { segments: [], minutes: 15 },
    ]);
    const csv = projectTreeToCsv(tree);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toEqual([
      "Projektpfad;Stunden;Anteil",
      "Work;1500,75;100 %",
      '"Work ▸ Kunde; A";1500,00;99,9 %',
      '"Work ▸ Intern ""B""";0,75;< 0,1 %',
      "Ohne Projekt;0,25;< 0,1 %",
      "Gesamt;1501,00;100 %",
    ]);
  });

  it("entschärft Formel-Präfixe gegen CSV-Injection", () => {
    const tree = buildProjectTree([{ segments: ["=SUMME(A1)"], minutes: 60 }]);
    const lines = projectTreeToCsv(tree).slice(1).split("\r\n");
    expect(lines[1]).toBe("'=SUMME(A1);1,00;100 %");
  });
});

describe("Gesamtbericht", () => {
  const now = new Date("2026-10-10T10:00:00Z");

  it("lädt Zeitraum und Verlaufsfenster gemeinsam", () => {
    expect(reportLoadRange({ kind: "month", key: "2026-10" }, now)).toEqual({
      firstKey: "2025-11-01",
      lastKey: "2026-10-31",
    });
    // Jahr: läuft über den laufenden Monat hinaus bis Jahresende
    expect(reportLoadRange({ kind: "year", key: "2026" }, now)).toEqual({
      firstKey: "2025-11-01",
      lastKey: "2026-12-31",
    });
  });

  it("trennt Zeitraum und Verlauf", () => {
    const report = buildProjectsReport(
      [
        entry("2026-10-05T09:00:00+02:00", "2026-10-05T11:00:00+02:00", "A"),
        entry("2026-09-05T09:00:00+02:00", "2026-09-05T10:00:00+02:00", "B"),
        entry("2026-10-06T09:00:00+02:00", "2026-10-06T17:00:00+02:00", null, {
          source: "BULK_FILL",
        }),
        entry("2026-10-07T09:00:00+02:00", "2026-10-07T17:00:00+02:00", "A", {
          type: "VACATION",
        }),
      ],
      { kind: "month", key: "2026-10" },
      now,
    );
    expect(report.period).toEqual({
      kind: "month",
      key: "2026-10",
      label: "Oktober 2026",
      shortLabel: "Okt 2026",
      firstKey: "2026-10-01",
      lastKey: "2026-10-31",
    });
    expect(report.summary).toEqual({
      totalMinutes: 600,
      entries: 2,
      unassignedMinutes: 480,
      bulkFillMinutes: 480,
    });
    expect(report.tree.nodes.map((n) => n.name)).toEqual(["A", "Ohne Projekt"]);
    expect(report.trend.months).toHaveLength(12);
    expect(report.trend.series.map((s) => s.label)).toEqual([
      "A",
      "B",
      "Ohne Projekt",
    ]);
  });
});
