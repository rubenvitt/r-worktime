import { describe, expect, it } from "vitest";

import {
  applyDecisionToReport,
  buildTravelCsv,
  buildTravelReport,
  overridesFromRows,
  parseTravelRangeQuery,
  resolveTravel,
  type TravelReportDayInput,
  travelDecisionSchema,
} from "./travel";

function day(
  date: string,
  overrides: Partial<TravelReportDayInput> = {},
): TravelReportDayInput {
  return {
    date,
    minutes: 480,
    activities: [{ title: "Alpha", minutes: 480 }],
    projects: ["Work ▸ Kunde A"],
    suggested: false,
    ...overrides,
  };
}

describe("resolveTravel", () => {
  it("nimmt ohne Festlegung den Vorschlag", () => {
    expect(resolveTravel(true, null)).toEqual({
      isTravel: true,
      status: "suggested",
      hasOverride: false,
    });
    expect(resolveTravel(false, undefined)).toEqual({
      isTravel: false,
      status: "none",
      hasOverride: false,
    });
  });

  it("lässt eine Festlegung immer vor dem Vorschlag gelten", () => {
    expect(resolveTravel(true, true)).toEqual({
      isTravel: true,
      status: "confirmed",
      hasOverride: true,
    });
    expect(resolveTravel(false, true)).toEqual({
      isTravel: true,
      status: "added",
      hasOverride: true,
    });
    expect(resolveTravel(true, false)).toEqual({
      isTravel: false,
      status: "rejected",
      hasOverride: true,
    });
    expect(resolveTravel(false, false)).toEqual({
      isTravel: false,
      status: "none",
      hasOverride: true,
    });
  });
});

describe("buildTravelReport", () => {
  it("führt Vorschläge und Festlegungen zu effektiven Reisetagen zusammen", () => {
    const report = buildTravelReport(
      2026,
      [
        day("2026-03-02", { suggested: true }),
        day("2026-03-03", { suggested: true }),
        day("2026-03-04", { suggested: true }),
        day("2026-04-01"),
        day("2026-04-02"),
      ],
      {
        "2026-03-03": true,
        "2026-03-04": false,
        "2026-04-01": true,
        "2026-04-02": false,
      },
    );

    expect(report.days.map((d) => [d.date, d.status])).toEqual([
      ["2026-03-02", "suggested"],
      ["2026-03-03", "confirmed"],
      ["2026-04-01", "added"],
    ]);
    expect(report.rejected.map((d) => d.date)).toEqual(["2026-03-04"]);
    expect(report.totals).toEqual({
      days: 3,
      minutes: 1440,
      open: 1,
      confirmed: 1,
      added: 1,
      rejected: 1,
    });
  });

  it("liefert alle zwölf Monate mit Summen", () => {
    const report = buildTravelReport(
      2026,
      [
        day("2026-03-02", { suggested: true, minutes: 300 }),
        day("2026-03-09", { suggested: true, minutes: 200 }),
        day("2026-11-05", { suggested: true, minutes: 60 }),
      ],
      {},
    );
    expect(report.months).toHaveLength(12);
    expect(report.months[0]).toEqual({ month: "2026-01", days: 0, minutes: 0 });
    expect(report.months[2]).toEqual({
      month: "2026-03",
      days: 2,
      minutes: 500,
    });
    expect(report.months[10]).toEqual({
      month: "2026-11",
      days: 1,
      minutes: 60,
    });
  });

  it("zeigt festgelegte Reisetage ohne Einträge mit 0 Stunden", () => {
    const report = buildTravelReport(2026, [], { "2026-05-04": true });
    expect(report.days).toEqual([
      {
        date: "2026-05-04",
        weekday: 1,
        minutes: 0,
        activities: [],
        projects: [],
        suggested: false,
        status: "added",
      },
    ]);
  });

  it("ignoriert Festlegungen außerhalb des Jahres und ungültige Schlüssel", () => {
    const report = buildTravelReport(2026, [], {
      "2025-12-31": true,
      "2027-01-01": true,
      "kein-datum": true,
    });
    expect(report.days).toEqual([]);
    expect(report.totals.days).toBe(0);
  });
});

describe("overridesFromRows", () => {
  it("macht aus DB-Zeilen eine Zuordnung Tag → Festlegung", () => {
    expect(
      overridesFromRows([
        { date: new Date("2026-03-02T00:00:00.000Z"), isTravel: true },
        { date: new Date("2026-03-03T00:00:00.000Z"), isTravel: false },
      ]),
    ).toEqual({ "2026-03-02": true, "2026-03-03": false });
  });
});

describe("buildTravelCsv", () => {
  it("schreibt Semikolon-CSV mit BOM, deutschem Datum und Dezimalkomma", () => {
    const report = buildTravelReport(
      2026,
      [
        day("2026-03-02", {
          suggested: true,
          minutes: 510,
          activities: [
            { title: 'Kunde "A"; Workshop', minutes: 450 },
            { title: "Fahrt\nzurück", minutes: 60 },
          ],
          projects: ["Work ▸ Kunde A"],
        }),
      ],
      {},
    );
    const csv = buildTravelCsv(report.days);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(
      "Datum;Wochentag;Projekte;Tätigkeiten;Stunden;Quelle",
    );
    expect(lines[1]).toBe(
      '02.03.2026;Montag;Work ▸ Kunde A;"Kunde ""A""; Workshop | Fahrt\nzurück";8,50;Vorschlag',
    );
    expect(lines).toHaveLength(2);
  });

  it("liefert nur die Kopfzeile ohne Reisetage", () => {
    expect(buildTravelCsv([])).toBe(
      "﻿Datum;Wochentag;Projekte;Tätigkeiten;Stunden;Quelle",
    );
  });
});

describe("parseTravelRangeQuery", () => {
  const parse = (query: string) =>
    parseTravelRangeQuery(new URLSearchParams(query));

  it("versteht Monat, Jahr und Zeitraum", () => {
    expect(parse("month=2026-02")).toEqual({
      success: true,
      data: { firstKey: "2026-02-01", lastKey: "2026-02-28" },
    });
    expect(parse("year=2024")).toEqual({
      success: true,
      data: { firstKey: "2024-01-01", lastKey: "2024-12-31" },
    });
    expect(parse("from=2026-03-01&to=2026-03-15")).toEqual({
      success: true,
      data: { firstKey: "2026-03-01", lastKey: "2026-03-15" },
    });
  });

  it("lehnt fehlende, doppelte und ungültige Angaben ab", () => {
    expect(parse("").success).toBe(false);
    expect(parse("month=2026-02&year=2026").success).toBe(false);
    expect(parse("from=2026-03-01").success).toBe(false);
    expect(parse("month=2026-13").success).toBe(false);
    expect(parse("from=2026-02-30&to=2026-03-01").success).toBe(false);
    expect(parse("from=2026-03-02&to=2026-03-01").success).toBe(false);
    // mehr als ein Jahr
    expect(parse("from=2025-01-01&to=2026-03-01").success).toBe(false);
  });
});

describe("travelDecisionSchema", () => {
  it("prüft Datum und Wahrheitswert", () => {
    expect(
      travelDecisionSchema.safeParse({ date: "2026-03-02", isTravel: true })
        .success,
    ).toBe(true);
    expect(
      travelDecisionSchema.safeParse({ date: "2026-02-30", isTravel: true })
        .success,
    ).toBe(false);
    expect(
      travelDecisionSchema.safeParse({ date: "2026-03-02", isTravel: "ja" })
        .success,
    ).toBe(false);
  });
});

describe("applyDecisionToReport", () => {
  const report = buildTravelReport(
    2026,
    [
      day("2026-03-02", { suggested: true }),
      day("2026-03-03", { suggested: true }),
      day("2026-04-01"),
    ],
    { "2026-03-03": false, "2026-04-01": true },
  );

  it("bestätigt einen Vorschlag", () => {
    const next = applyDecisionToReport(report, {
      date: "2026-03-02",
      isTravel: true,
    });
    expect(next.days.find((d) => d.date === "2026-03-02")?.status).toBe(
      "confirmed",
    );
    expect(next.totals.open).toBe(0);
    expect(next.totals.confirmed).toBe(1);
  });

  it("stellt einen abgelehnten Vorschlag wieder her", () => {
    const next = applyDecisionToReport(report, {
      date: "2026-03-03",
      isTravel: null,
    });
    expect(next.rejected).toEqual([]);
    expect(next.days.map((d) => d.date)).toEqual([
      "2026-03-02",
      "2026-03-03",
      "2026-04-01",
    ]);
    expect(next.months[2]).toMatchObject({ days: 2, minutes: 960 });
  });

  it("entfernt einen manuellen Reisetag ganz", () => {
    const next = applyDecisionToReport(report, {
      date: "2026-04-01",
      isTravel: null,
    });
    expect(next.days.map((d) => d.date)).toEqual(["2026-03-02"]);
    expect(next.rejected.map((d) => d.date)).toEqual(["2026-03-03"]);
  });

  it("fügt einen Tag ohne Einträge hinzu und ignoriert fremde Jahre", () => {
    const added = applyDecisionToReport(report, {
      date: "2026-06-01",
      isTravel: true,
    });
    expect(added.days.at(-1)).toMatchObject({
      date: "2026-06-01",
      status: "added",
      minutes: 0,
    });
    expect(
      applyDecisionToReport(report, { date: "2025-06-01", isTravel: true }),
    ).toBe(report);
  });
});
