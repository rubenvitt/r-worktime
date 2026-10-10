import { describe, expect, it } from "vitest";
import {
  type BillingSourceEntry,
  buildBillingReport,
  isBillingRelevant,
  parseBillingQuery,
  projectGroup,
  splitHoursByBillingClass,
  UNKNOWN_SHARE_HINT_THRESHOLD,
} from "./billing";

/** Eintrag mit Start um 10:00 Berlin (Sommerzeit: 08:00 UTC). */
function entry(
  dateKey: string,
  hours: number,
  overrides: Partial<BillingSourceEntry> = {},
): BillingSourceEntry {
  return {
    startTime: new Date(`${dateKey}T08:00:00.000Z`),
    duration: hours,
    type: "WORK",
    source: "TIMING_SYNC",
    description: null,
    billingStatus: "billable",
    projectPath: "Work ▸ Kunde A ▸ Entwicklung",
    ...overrides,
  };
}

describe("isBillingRelevant", () => {
  it("zählt nur WORK und OVERTIME", () => {
    expect(isBillingRelevant(entry("2026-10-01", 1))).toBe(true);
    expect(
      isBillingRelevant(entry("2026-10-01", 1, { type: "OVERTIME" })),
    ).toBe(true);
  });

  it("schließt Abwesenheiten aus, auch wenn sie einen Status tragen", () => {
    // Demo-Daten: Urlaub und Krankheit kommen mit billingStatus "unbilled"
    expect(
      isBillingRelevant(
        entry("2026-10-01", 8, { type: "VACATION", billingStatus: "billable" }),
      ),
    ).toBe(false);
    expect(
      isBillingRelevant(
        entry("2026-10-01", 8, { type: "SICK", billingStatus: "unbilled" }),
      ),
    ).toBe(false);
    expect(isBillingRelevant(entry("2026-10-01", 8, { type: "HOLIDAY" }))).toBe(
      false,
    );
  });

  it("schließt den Anfangssaldo aus (source und Alt-Marker)", () => {
    expect(
      isBillingRelevant(
        entry("2026-10-01", 12.5, { type: "OVERTIME", source: "ADJUSTMENT" }),
      ),
    ).toBe(false);
    expect(
      isBillingRelevant(
        entry("2026-10-01", 12.5, {
          type: "OVERTIME",
          source: "MANUAL",
          description: "Anfangs-Überstunden-Saldo",
        }),
      ),
    ).toBe(false);
  });

  it("behält aufgefüllte Arbeitstage", () => {
    expect(
      isBillingRelevant(
        entry("2026-10-01", 8, { source: "BULK_FILL", billingStatus: null }),
      ),
    ).toBe(true);
  });
});

describe("splitHoursByBillingClass", () => {
  it("teilt Arbeitsstunden nach Klasse und ignoriert den Rest", () => {
    const result = splitHoursByBillingClass([
      { ...entry("2026-10-01", 2), hours: 2 },
      { ...entry("2026-10-01", 1, { billingStatus: "paid" }), hours: 1 },
      {
        ...entry("2026-10-01", 1.5, { billingStatus: "not_billable" }),
        hours: 1.5,
      },
      { ...entry("2026-10-01", 0.5, { billingStatus: null }), hours: 0.5 },
      {
        ...entry("2026-10-01", 8, {
          type: "VACATION",
          billingStatus: "unbilled",
        }),
        hours: 8,
      },
      {
        ...entry("2026-10-01", 12.5, {
          type: "OVERTIME",
          source: "ADJUSTMENT",
          billingStatus: null,
        }),
        hours: 12.5,
      },
    ]);
    expect(result).toEqual({ billable: 3, nonBillable: 1.5, unknown: 0.5 });
  });
});

describe("projectGroup", () => {
  it("nimmt die oberste Ebene", () => {
    expect(projectGroup("Work ▸ Kunde A ▸ Entwicklung", 1)).toBe("Work");
  });

  it("nimmt tiefere Ebenen, wenn gewünscht", () => {
    expect(projectGroup("Work ▸ Kunde A ▸ Entwicklung", 2)).toBe(
      "Work ▸ Kunde A",
    );
    // Kürzere Pfade bleiben vollständig
    expect(projectGroup("Intern", 3)).toBe("Intern");
  });

  it("fasst Einträge ohne Projekt zusammen", () => {
    expect(projectGroup(null, 1)).toBe("Ohne Projekt");
    expect(projectGroup("", 1)).toBe("Ohne Projekt");
    expect(projectGroup("  ▸ ", 1)).toBe("Ohne Projekt");
  });
});

describe("buildBillingReport", () => {
  const october = { kind: "month", key: "2026-10" } as const;

  it("summiert nach Status, Klasse und Quote", () => {
    const report = buildBillingReport(
      [
        entry("2026-10-01", 2, { billingStatus: "billable" }),
        entry("2026-10-02", 1, { billingStatus: "Billable" }),
        entry("2026-10-02", 1, { billingStatus: "billed" }),
        entry("2026-10-03", 0.5, { billingStatus: "paid" }),
        entry("2026-10-05", 1.5, { billingStatus: "not_billable" }),
        entry("2026-10-06", 2, { billingStatus: null }),
      ],
      { period: october },
    );

    expect(report.totals).toMatchObject({
      totalMinutes: 480,
      billableMinutes: 270,
      nonBillableMinutes: 90,
      unknownMinutes: 120,
      entryCount: 6,
    });
    expect(report.totals.billableShare).toBeCloseTo(270 / 480);
    expect(report.totals.classifiedShare).toBeCloseTo(270 / 360);
    expect(report.totals.unknownShare).toBeCloseTo(120 / 480);

    expect(report.statuses.map((s) => [s.status, s.minutes])).toEqual([
      ["open", 180],
      ["billed", 60],
      ["paid", 30],
      ["notBillable", 90],
      ["unknown", 120],
    ]);
    const open = report.statuses[0];
    expect(open.label).toBe("Offen");
    expect(open.billingClass).toBe("billable");
    expect(open.share).toBeCloseTo(180 / 480);
  });

  it("hält Rohwerte in Originalschreibweise auseinander", () => {
    const report = buildBillingReport(
      [
        entry("2026-10-01", 2, { billingStatus: "billable" }),
        entry("2026-10-02", 1, { billingStatus: "Billable" }),
        entry("2026-10-02", 1, { billingStatus: "billable" }),
        entry("2026-10-02", 1, { billingStatus: null }),
        entry("2026-10-02", 1, { billingStatus: "undetermined" }),
      ],
      { period: october },
    );
    const open = report.statuses.find((s) => s.status === "open");
    expect(open?.rawValues).toEqual([
      { raw: "billable", minutes: 180, entryCount: 2 },
      { raw: "Billable", minutes: 60, entryCount: 1 },
    ]);
    const unknown = report.statuses.find((s) => s.status === "unknown");
    expect(unknown?.rawValues).toEqual([
      { raw: null, minutes: 60, entryCount: 1 },
      { raw: "undetermined", minutes: 60, entryCount: 1 },
    ]);
  });

  it("schlüsselt je Status nach Projekt auf, absteigend", () => {
    const report = buildBillingReport(
      [
        entry("2026-10-01", 1, { projectPath: "Work ▸ Kunde A" }),
        entry("2026-10-01", 3, { projectPath: "Privat ▸ Verein" }),
        entry("2026-10-02", 1, { projectPath: "Work ▸ Kunde B" }),
        entry("2026-10-02", 0.5, { projectPath: null }),
      ],
      { period: october },
    );
    const open = report.statuses[0];
    expect(open.projects).toEqual([
      { name: "Privat", minutes: 180, share: 180 / 330 },
      { name: "Work", minutes: 120, share: 120 / 330 },
      { name: "Ohne Projekt", minutes: 30, share: 30 / 330 },
    ]);

    const deeper = buildBillingReport(
      [
        entry("2026-10-01", 1, { projectPath: "Work ▸ Kunde A ▸ Dev" }),
        entry("2026-10-01", 2, { projectPath: "Work ▸ Kunde B" }),
      ],
      { period: october, depth: 2 },
    );
    expect(deeper.depth).toBe(2);
    expect(deeper.statuses[0].projects.map((p) => p.name)).toEqual([
      "Work ▸ Kunde B",
      "Work ▸ Kunde A",
    ]);
  });

  it("filtert Abwesenheiten, Saldo und Einträge außerhalb des Zeitraums", () => {
    const report = buildBillingReport(
      [
        entry("2026-10-01", 1),
        entry("2026-10-02", 8, { type: "VACATION", billingStatus: "unbilled" }),
        entry("2026-10-02", 12.5, {
          type: "OVERTIME",
          source: "ADJUSTMENT",
          billingStatus: null,
        }),
        entry("2026-09-30", 4),
        entry("2026-11-01", 4),
      ],
      { period: october },
    );
    expect(report.totals.totalMinutes).toBe(60);
    expect(report.totals.entryCount).toBe(1);
  });

  it("ordnet nach dem Berliner Tag des Starts zu", () => {
    const report = buildBillingReport(
      [
        // 30.09. 23:30 UTC = 01.10. 01:30 Berlin → Oktober
        {
          ...entry("2026-09-30", 1),
          startTime: new Date("2026-09-30T23:30:00.000Z"),
        },
        // 31.10. 22:30 UTC = 31.10. 23:30 Berlin (Winterzeit) → Oktober
        {
          ...entry("2026-10-31", 2),
          startTime: new Date("2026-10-31T22:30:00.000Z"),
        },
        // 31.10. 23:30 UTC = 01.11. 00:30 Berlin → November
        {
          ...entry("2026-10-31", 4),
          startTime: new Date("2026-10-31T23:30:00.000Z"),
        },
      ],
      { period: october },
    );
    expect(report.totals.totalMinutes).toBe(180);
  });

  it("weist aufgefüllte Stunden innerhalb von „Ohne Status“ aus", () => {
    const report = buildBillingReport(
      [
        entry("2026-10-01", 8, { source: "BULK_FILL", billingStatus: null }),
        entry("2026-10-02", 1, { billingStatus: null }),
        entry("2026-10-02", 1),
      ],
      { period: october },
    );
    expect(report.totals.unknownMinutes).toBe(540);
    expect(report.totals.bulkFillMinutes).toBe(480);
  });

  it("liefert null-Quoten ohne Stunden", () => {
    const report = buildBillingReport([], { period: october });
    expect(report.totals.totalMinutes).toBe(0);
    expect(report.totals.billableShare).toBeNull();
    expect(report.totals.classifiedShare).toBeNull();
    expect(report.totals.unknownShare).toBeNull();
    expect(report.statuses.every((s) => s.share === null)).toBe(true);
    expect(report.showUnknownHint).toBe(false);
  });

  it("zeigt den Hinweis erst ab der Schwelle für „Ohne Status“", () => {
    const below = buildBillingReport(
      [
        entry("2026-10-01", 19),
        entry("2026-10-01", 1, { billingStatus: null }),
      ],
      { period: october },
    );
    expect(below.totals.unknownShare).toBeCloseTo(0.05);
    expect(below.showUnknownHint).toBe(false);

    const above = buildBillingReport(
      [entry("2026-10-01", 4), entry("2026-10-01", 1, { billingStatus: null })],
      { period: october },
    );
    expect(above.totals.unknownShare).toBeCloseTo(0.2);
    expect(above.totals.unknownShare).toBeGreaterThanOrEqual(
      UNKNOWN_SHARE_HINT_THRESHOLD,
    );
    expect(above.showUnknownHint).toBe(true);
  });

  it("baut den 12-Monats-Verlauf mit null für leere Monate", () => {
    const report = buildBillingReport(
      [
        entry("2026-10-01", 3),
        entry("2026-10-02", 1, { billingStatus: "not_billable" }),
        entry("2026-08-03", 2, { billingStatus: null }),
        entry("2025-10-15", 5), // vor dem Fenster
      ],
      { period: october },
    );
    expect(report.trend).toHaveLength(12);
    expect(report.trend[0].month).toBe("2025-11");
    expect(report.trend[11]).toEqual({
      month: "2026-10",
      billableMinutes: 180,
      nonBillableMinutes: 60,
      unknownMinutes: 0,
      totalMinutes: 240,
      billableShare: 0.75,
    });
    const august = report.trend.find((t) => t.month === "2026-08");
    expect(august?.billableShare).toBe(0);
    expect(august?.unknownMinutes).toBe(120);
    const september = report.trend.find((t) => t.month === "2026-09");
    expect(september?.totalMinutes).toBe(0);
    expect(september?.billableShare).toBeNull();
  });

  it("gibt den Zeitraum mit zurück", () => {
    const report = buildBillingReport([], {
      period: { kind: "quarter", key: "2026-Q3" },
    });
    expect(report.period).toEqual({
      kind: "quarter",
      key: "2026-Q3",
      label: "3. Quartal 2026",
      shortLabel: "Q3 2026",
      firstKey: "2026-07-01",
      lastKey: "2026-09-30",
    });
    expect(report.depth).toBe(1);
  });
});

describe("parseBillingQuery", () => {
  const parse = (query: string) =>
    parseBillingQuery(new URLSearchParams(query), "2026-10-10");

  it("nimmt ohne Angaben den laufenden Monat und Ebene 1", () => {
    const result = parse("");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.period.key).toBe("2026-10");
    expect(result.data.depth).toBe(1);
  });

  it("nimmt den laufenden Zeitraum der gewählten Granularität", () => {
    const result = parse("period=quarter");
    expect(result.success && result.data.period.key).toBe("2026-Q4");
  });

  it("liest Zeitraum und Ebene", () => {
    const result = parse("period=year&key=2025&depth=3");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.period).toEqual({ kind: "year", key: "2025" });
    expect(result.data.depth).toBe(3);
  });

  it("meldet ungültige Werte auf Deutsch", () => {
    expect(parse("period=week")).toEqual({
      success: false,
      error: "Zeitraum muss month, quarter oder year sein",
    });
    expect(parse("period=quarter&key=2026-10")).toEqual({
      success: false,
      error: "Zeitraum im Format JJJJ-QN erwartet",
    });
    expect(parse("depth=0").success).toBe(false);
    expect(parse("depth=5").success).toBe(false);
    expect(parse("depth=abc").success).toBe(false);
  });
});
