import { describe, expect, it } from "vitest";
import { ADJUSTMENT_MARKER } from "@/lib/adjustment-marker";
import {
  analyzePatterns,
  buildPatternDays,
  classifyPatternEntry,
  describeFinding,
  formatClock,
  type Interval,
  MIN_GAP_MINUTES,
  mergeIntervals,
  type PatternSourceEntry,
  parsePatternPeriod,
  patternPeriodParams,
  resolvePatternRange,
  switchPatternPeriod,
} from "./patterns";

// Alle Zeitstempel haben einen expliziten Offset, damit die Tests nicht von
// der Zeitzone des Rechners abhängen (Sommerzeit +02:00, Winterzeit +01:00).

function entry(
  start: string,
  end: string,
  extra: Partial<PatternSourceEntry> = {},
): PatternSourceEntry {
  return {
    startTime: new Date(start),
    endTime: new Date(end),
    type: "WORK",
    source: "TIMING_SYNC",
    description: null,
    ...extra,
  };
}

const ms = (iso: string) => new Date(iso).getTime();
const iv = (start: string, end: string): Interval => ({
  start: ms(start),
  end: ms(end),
});

describe("classifyPatternEntry", () => {
  it("zählt WORK aus Timing, Datei-Import und manuell als Arbeit", () => {
    for (const source of ["TIMING_SYNC", "FILE_IMPORT", "MANUAL"]) {
      expect(
        classifyPatternEntry(
          entry("2026-10-05T09:00:00+02:00", "2026-10-05T10:00:00+02:00", {
            source,
          }),
        ),
      ).toBe("work");
    }
  });

  it("schließt Auffüllung, Saldo, Feiertage und Abwesenheiten aus", () => {
    const base = [
      "2026-10-05T09:00:00+02:00",
      "2026-10-05T17:00:00+02:00",
    ] as const;
    expect(classifyPatternEntry(entry(...base, { source: "BULK_FILL" }))).toBe(
      "bulkFill",
    );
    expect(classifyPatternEntry(entry(...base, { source: "ADJUSTMENT" }))).toBe(
      "adjustment",
    );
    // OVERTIME ist ausschließlich die Saldo-Buchung
    expect(classifyPatternEntry(entry(...base, { type: "OVERTIME" }))).toBe(
      "adjustment",
    );
    expect(
      classifyPatternEntry(
        entry(...base, { description: `Alt: ${ADJUSTMENT_MARKER}` }),
      ),
    ).toBe("adjustment");
    expect(classifyPatternEntry(entry(...base, { source: "HOLIDAY" }))).toBe(
      "holiday",
    );
    expect(classifyPatternEntry(entry(...base, { type: "HOLIDAY" }))).toBe(
      "holiday",
    );
    expect(classifyPatternEntry(entry(...base, { type: "VACATION" }))).toBe(
      "absence",
    );
    expect(classifyPatternEntry(entry(...base, { type: "SICK" }))).toBe(
      "absence",
    );
  });

  it("verwirft Einträge ohne positive Dauer", () => {
    expect(
      classifyPatternEntry(
        entry("2026-10-05T09:00:00+02:00", "2026-10-05T09:00:00+02:00"),
      ),
    ).toBe("invalid");
    expect(
      classifyPatternEntry(
        entry("2026-10-05T10:00:00+02:00", "2026-10-05T09:00:00+02:00"),
      ),
    ).toBe("invalid");
    expect(
      classifyPatternEntry({
        ...entry("2026-10-05T09:00:00+02:00", "2026-10-05T10:00:00+02:00"),
        startTime: new Date("kaputt"),
      }),
    ).toBe("invalid");
  });

  it("ordnet den Saldo (Beginn = Ende) als Saldo ein, nicht als ungültig", () => {
    const instant = "2026-01-01T00:00:00+01:00";
    expect(
      classifyPatternEntry(
        entry(instant, instant, { type: "OVERTIME", source: "ADJUSTMENT" }),
      ),
    ).toBe("adjustment");
    expect(
      classifyPatternEntry(entry(instant, instant, { type: "OVERTIME" })),
    ).toBe("adjustment");
  });
});

describe("mergeIntervals", () => {
  it("vereinigt überlappende, verschachtelte und angrenzende Intervalle", () => {
    const merged = mergeIntervals([
      iv("2026-10-05T13:00:00+02:00", "2026-10-05T14:00:00+02:00"),
      iv("2026-10-05T09:00:00+02:00", "2026-10-05T11:00:00+02:00"),
      iv("2026-10-05T09:30:00+02:00", "2026-10-05T10:00:00+02:00"), // verschachtelt
      iv("2026-10-05T10:30:00+02:00", "2026-10-05T12:00:00+02:00"), // überlappend
      iv("2026-10-05T12:00:00+02:00", "2026-10-05T12:15:00+02:00"), // angrenzend
    ]);
    expect(merged).toEqual([
      iv("2026-10-05T09:00:00+02:00", "2026-10-05T12:15:00+02:00"),
      iv("2026-10-05T13:00:00+02:00", "2026-10-05T14:00:00+02:00"),
    ]);
  });

  it("verändert die Eingabe nicht und kommt mit leerer Liste klar", () => {
    const input = [
      iv("2026-10-05T13:00:00+02:00", "2026-10-05T14:00:00+02:00"),
      iv("2026-10-05T09:00:00+02:00", "2026-10-05T10:00:00+02:00"),
    ];
    const copy = input.map((i) => ({ ...i }));
    mergeIntervals(input);
    expect(input).toEqual(copy);
    expect(mergeIntervals([])).toEqual([]);
  });
});

describe("buildPatternDays", () => {
  it("berechnet Beginn, Ende, Spanne, Netto und Pause eines Tages", () => {
    const [day] = buildPatternDays([
      entry("2026-10-05T13:00:00+02:00", "2026-10-05T17:00:00+02:00"),
      entry("2026-10-05T08:00:00+02:00", "2026-10-05T12:30:00+02:00"),
    ]);
    expect(day).toMatchObject({
      date: "2026-10-05",
      weekday: 1,
      startMinute: 8 * 60,
      endMinute: 17 * 60,
      spanMinutes: 9 * 60,
      netMinutes: 8.5 * 60,
      breakMinutes: 30,
      qualifyingBreakMinutes: 30,
      longestStretchMinutes: 4.5 * 60,
      entryCount: 2,
    });
    expect(day.breaks).toEqual([
      { startMinute: 12 * 60 + 30, endMinute: 13 * 60, minutes: 30 },
    ]);
    expect(day.blocks).toEqual([
      { startMinute: 480, endMinute: 750 },
      { startMinute: 780, endMinute: 1020 },
    ]);
  });

  it("zählt überlappende Einträge nur einmal", () => {
    const [day] = buildPatternDays([
      entry("2026-10-05T09:00:00+02:00", "2026-10-05T12:00:00+02:00"),
      entry("2026-10-05T09:00:00+02:00", "2026-10-05T12:00:00+02:00"),
      entry("2026-10-05T11:00:00+02:00", "2026-10-05T13:00:00+02:00"),
    ]);
    expect(day.netMinutes).toBe(240);
    expect(day.spanMinutes).toBe(240);
    expect(day.breakMinutes).toBe(0);
  });

  it(`ignoriert Lücken unter ${MIN_GAP_MINUTES} Minuten als Pause, zählt sie aber nicht als Arbeit`, () => {
    const [day] = buildPatternDays([
      entry("2026-10-05T09:00:00+02:00", "2026-10-05T10:00:00+02:00"),
      entry("2026-10-05T10:04:00+02:00", "2026-10-05T11:00:00+02:00"),
    ]);
    expect(day.netMinutes).toBe(116);
    expect(day.spanMinutes).toBe(120);
    expect(day.breakMinutes).toBe(0);
    expect(day.breaks).toEqual([]);
    // Lücken unter 5 min unterbrechen auch die Arbeitsstrecke nicht
    expect(day.longestStretchMinutes).toBe(116);
  });

  it("zählt eine Lücke von genau 5 Minuten als Pause", () => {
    const [day] = buildPatternDays([
      entry("2026-10-05T09:00:00+02:00", "2026-10-05T10:00:00+02:00"),
      entry("2026-10-05T10:05:00+02:00", "2026-10-05T11:00:00+02:00"),
    ]);
    expect(day.breakMinutes).toBe(5);
    expect(day.qualifyingBreakMinutes).toBe(0);
    expect(day.breaks).toHaveLength(1);
  });

  it("zählt Einträge je Tag, auch wenn sie sich überlappen", () => {
    const days = buildPatternDays([
      entry("2026-10-05T09:00:00+02:00", "2026-10-05T10:00:00+02:00"),
      entry("2026-10-05T09:30:00+02:00", "2026-10-05T10:30:00+02:00"),
      entry("2026-10-05T14:00:00+02:00", "2026-10-05T15:00:00+02:00"),
      entry("2026-10-06T00:30:00+02:00", "2026-10-06T01:00:00+02:00"),
      entry("2026-10-06T09:00:00+02:00", "2026-10-06T10:00:00+02:00"),
    ]);
    expect(days.map((d) => [d.date, d.entryCount])).toEqual([
      ["2026-10-05", 4],
      ["2026-10-06", 1],
    ]);
  });

  it("ordnet Arbeit über Mitternacht dem Starttag zu", () => {
    const [day] = buildPatternDays([
      entry("2026-10-05T22:00:00+02:00", "2026-10-06T01:00:00+02:00"),
    ]);
    expect(day.date).toBe("2026-10-05");
    expect(day.startMinute).toBe(22 * 60);
    expect(day.endMinute).toBe(25 * 60);
    expect(day.netMinutes).toBe(180);
  });

  it("zählt Arbeit vor 4 Uhr zum Vortag (Tagesgrenze 04:00)", () => {
    const days = buildPatternDays([
      entry("2026-10-05T18:00:00+02:00", "2026-10-05T23:00:00+02:00"),
      entry("2026-10-06T00:30:00+02:00", "2026-10-06T01:30:00+02:00"),
      entry("2026-10-06T09:00:00+02:00", "2026-10-06T12:00:00+02:00"),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06"]);
    expect(days[0]).toMatchObject({
      startMinute: 18 * 60,
      endMinute: 25.5 * 60,
      netMinutes: 6 * 60,
      breakMinutes: 90,
    });
    expect(days[1].startMinute).toBe(9 * 60);
  });

  it("legt einen Block, der um 04:00 beginnt, auf den neuen Tag", () => {
    const [day] = buildPatternDays([
      entry("2026-10-06T04:00:00+02:00", "2026-10-06T06:00:00+02:00"),
    ]);
    expect(day.date).toBe("2026-10-06");
    expect(day.startMinute).toBe(240);
  });

  it("rechnet Dauern am Sommerzeitbeginn in echter Zeit", () => {
    // 28.03. 22:00 MEZ bis 29.03. 05:00 MESZ: 02:00–03:00 gibt es nicht → 6 h
    const [day] = buildPatternDays([
      entry("2026-03-28T22:00:00+01:00", "2026-03-29T05:00:00+02:00"),
    ]);
    expect(day.date).toBe("2026-03-28");
    expect(day.startMinute).toBe(22 * 60);
    expect(day.endMinute).toBe(24 * 60 + 5 * 60);
    expect(day.netMinutes).toBe(360);
    expect(day.spanMinutes).toBe(360);
  });

  it("rechnet Dauern am Sommerzeitende in echter Zeit", () => {
    // 24.10. 22:00 MESZ bis 25.10. 05:00 MEZ: 02:00–03:00 doppelt → 8 h
    const [day] = buildPatternDays([
      entry("2026-10-24T22:00:00+02:00", "2026-10-25T05:00:00+01:00"),
    ]);
    expect(day.endMinute).toBe(29 * 60);
    expect(day.netMinutes).toBe(480);
    expect(day.spanMinutes).toBe(480);
  });

  it("ignoriert ausgeschlossene Einträge", () => {
    const days = buildPatternDays([
      entry("2026-10-05T09:00:00+01:00", "2026-10-05T17:00:00+01:00", {
        source: "BULK_FILL",
      }),
      entry("2026-10-06T09:00:00+02:00", "2026-10-06T10:00:00+02:00"),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-10-06"]);
  });

  it("sortiert die Tage chronologisch, unabhängig von der Eingabe", () => {
    const days = buildPatternDays([
      entry("2026-10-07T09:00:00+02:00", "2026-10-07T10:00:00+02:00"),
      entry("2026-10-05T09:00:00+02:00", "2026-10-05T10:00:00+02:00"),
      entry("2026-10-06T09:00:00+02:00", "2026-10-06T10:00:00+02:00"),
    ]);
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
  });

  it("ermittelt die längste Strecke ohne Pause von mindestens 15 Minuten", () => {
    const [day] = buildPatternDays([
      entry("2026-10-05T07:00:00+02:00", "2026-10-05T10:00:00+02:00"),
      // 10 min Lücke: Pause, aber keine Ruhepause im Sinne von §4
      entry("2026-10-05T10:10:00+02:00", "2026-10-05T13:30:00+02:00"),
      entry("2026-10-05T14:00:00+02:00", "2026-10-05T15:00:00+02:00"),
    ]);
    expect(day.longestStretchMinutes).toBe(180 + 200);
    expect(day.breakMinutes).toBe(40);
    expect(day.qualifyingBreakMinutes).toBe(30);
  });
});

describe("resolvePatternRange", () => {
  const today = "2026-10-10";

  it("endet beim laufenden Monat gestern", () => {
    expect(
      resolvePatternRange({ kind: "month", key: "2026-10" }, today),
    ).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      effectiveTo: "2026-10-09",
      isEmpty: false,
    });
  });

  it("nimmt vergangene Monate vollständig", () => {
    expect(
      resolvePatternRange({ kind: "month", key: "2026-02" }, today),
    ).toMatchObject({
      from: "2026-02-01",
      to: "2026-02-28",
      effectiveTo: "2026-02-28",
      isEmpty: false,
    });
  });

  it("berechnet Quartale und Jahre", () => {
    expect(
      resolvePatternRange({ kind: "quarter", key: "2026-Q3" }, today),
    ).toMatchObject({ from: "2026-07-01", to: "2026-09-30" });
    expect(
      resolvePatternRange({ kind: "quarter", key: "2026-Q4" }, today),
    ).toMatchObject({
      from: "2026-10-01",
      to: "2026-12-31",
      effectiveTo: "2026-10-09",
    });
    expect(
      resolvePatternRange({ kind: "year", key: "2025" }, today),
    ).toMatchObject({
      from: "2025-01-01",
      to: "2025-12-31",
      effectiveTo: "2025-12-31",
    });
  });

  it("umfasst bei „letzte 90 Tage“ genau 90 Tage bis gestern", () => {
    expect(resolvePatternRange({ kind: "last90" }, today)).toEqual({
      from: "2026-07-12",
      to: "2026-10-09",
      effectiveTo: "2026-10-09",
      isEmpty: false,
    });
  });

  it("markiert Zeiträume ohne vergangene Tage als leer", () => {
    expect(
      resolvePatternRange({ kind: "month", key: "2026-11" }, today).isEmpty,
    ).toBe(true);
    // Am Monatsersten gibt es im laufenden Monat noch keinen fertigen Tag
    expect(
      resolvePatternRange({ kind: "month", key: "2026-10" }, "2026-10-01")
        .isEmpty,
    ).toBe(true);
  });
});

describe("parsePatternPeriod / patternPeriodParams", () => {
  const parse = (query: string) =>
    parsePatternPeriod(new URLSearchParams(query));

  it("liest gültige Zeiträume", () => {
    expect(parse("period=month&key=2026-10")).toEqual({
      kind: "month",
      key: "2026-10",
    });
    expect(parse("period=quarter&key=2026-Q4")).toEqual({
      kind: "quarter",
      key: "2026-Q4",
    });
    expect(parse("period=year&key=2025")).toEqual({
      kind: "year",
      key: "2025",
    });
    expect(parse("period=last90")).toEqual({ kind: "last90" });
  });

  it("lehnt ungültige Angaben ab", () => {
    for (const query of [
      "",
      "period=week",
      "period=month",
      "period=month&key=2026-13",
      "period=month&key=1999-12",
      "period=quarter&key=2026-Q5",
      "period=year&key=26",
      "period=year&key=2101",
    ]) {
      expect(parse(query)).toBeNull();
    }
  });

  it("baut die Query so, dass parse sie zurückliest", () => {
    for (const period of [
      { kind: "month", key: "2026-10" },
      { kind: "quarter", key: "2026-Q2" },
      { kind: "year", key: "2026" },
      { kind: "last90" },
    ] as const) {
      expect(parsePatternPeriod(patternPeriodParams(period))).toEqual(period);
    }
  });
});

describe("switchPatternPeriod", () => {
  const today = "2026-10-10";

  it("springt von „90 Tage“ in den laufenden Zeitraum und zurück", () => {
    expect(switchPatternPeriod({ kind: "last90" }, "month", today)).toEqual({
      kind: "month",
      key: "2026-10",
    });
    expect(
      switchPatternPeriod({ kind: "year", key: "2025" }, "last90", today),
    ).toEqual({ kind: "last90" });
  });

  it("bleibt im angezeigten Zeitraum", () => {
    expect(
      switchPatternPeriod({ kind: "month", key: "2025-05" }, "quarter", today),
    ).toEqual({ kind: "quarter", key: "2025-Q2" });
    expect(
      switchPatternPeriod({ kind: "year", key: "2025" }, "month", today),
    ).toEqual({ kind: "month", key: "2025-01" });
  });
});

describe("analyzePatterns", () => {
  const range = { from: "2026-10-01", to: "2026-10-31" };

  it("liefert für leere Eingaben null statt NaN", () => {
    const report = analyzePatterns([], { ...range, holidays: {} });
    expect(report.summary).toBeNull();
    expect(report.days).toEqual([]);
    expect(report.findings).toEqual([]);
    expect(report.histogram.start).toEqual([]);
    expect(report.weekdays).toHaveLength(7);
    for (const weekday of report.weekdays) {
      expect(weekday.days).toBe(0);
      expect(weekday.avgNetMinutes).toBeNull();
      expect(weekday.avgStartMinute).toBeNull();
    }
    expect(
      report.heatmap.every((row) => row.minutes.every((m) => m === 0)),
    ).toBe(true);
    expect(JSON.stringify(report)).not.toContain("NaN");
  });

  it("berechnet Durchschnitt und Median (gerade Anzahl) für Beginn und Ende", () => {
    const report = analyzePatterns(
      [
        entry("2026-10-05T08:00:00+02:00", "2026-10-05T16:00:00+02:00"),
        entry("2026-10-06T09:00:00+02:00", "2026-10-06T17:00:00+02:00"),
        entry("2026-10-07T07:00:00+02:00", "2026-10-07T15:00:00+02:00"),
        entry("2026-10-08T10:00:00+02:00", "2026-10-08T20:00:00+02:00"),
      ],
      { ...range, holidays: {} },
    );
    const summary = report.summary;
    expect(summary).not.toBeNull();
    if (!summary) return;
    expect(summary.days).toBe(4);
    expect(summary.avgStartMinute).toBe(8.5 * 60);
    expect(summary.medianStartMinute).toBe(8.5 * 60);
    expect(summary.avgEndMinute).toBe(17 * 60);
    expect(summary.medianEndMinute).toBe(16.5 * 60);
    expect(summary.avgNetMinutes).toBe(8.5 * 60);
    expect(summary.totalNetMinutes).toBe(34 * 60);
    expect(summary.avgBreakMinutes).toBe(0);
    expect(summary.earliestStart).toEqual({ date: "2026-10-07", minute: 420 });
    expect(summary.latestEnds[0]).toEqual({ date: "2026-10-08", minute: 1200 });
    expect(summary.latestEnds.map((e) => e.date)).toEqual([
      "2026-10-08",
      "2026-10-06",
      "2026-10-05",
      "2026-10-07",
    ]);
  });

  it("filtert auf den Zeitraum, nutzt den Vortag aber für die Ruhezeit", () => {
    const report = analyzePatterns(
      [
        entry("2026-09-30T15:00:00+02:00", "2026-09-30T23:00:00+02:00"),
        entry("2026-10-01T08:00:00+02:00", "2026-10-01T12:00:00+02:00"),
        entry("2026-11-01T08:00:00+01:00", "2026-11-01T12:00:00+01:00"),
      ],
      { ...range, holidays: {} },
    );
    expect(report.days.map((d) => d.date)).toEqual(["2026-10-01"]);
    expect(report.findings).toEqual([
      expect.objectContaining({
        date: "2026-10-01",
        rule: "rest",
        restMinutes: 9 * 60,
        previousDate: "2026-09-30",
      }),
    ]);
  });

  it("wertet je Wochentag aus (Mo bis So)", () => {
    const report = analyzePatterns(
      [
        entry("2026-10-05T08:00:00+02:00", "2026-10-05T16:00:00+02:00"), // Mo
        entry("2026-10-12T10:00:00+02:00", "2026-10-12T16:00:00+02:00"), // Mo
        entry("2026-10-06T09:00:00+02:00", "2026-10-06T17:00:00+02:00"), // Di
      ],
      { ...range, holidays: {} },
    );
    expect(report.weekdays.map((w) => w.weekday)).toEqual([
      1, 2, 3, 4, 5, 6, 0,
    ]);
    expect(report.weekdays[0]).toEqual({
      weekday: 1,
      days: 2,
      avgNetMinutes: 7 * 60,
      avgStartMinute: 9 * 60,
      avgEndMinute: 16 * 60,
      avgBreakMinutes: 0,
    });
    expect(report.weekdays[1].days).toBe(1);
    expect(report.weekdays[2].avgNetMinutes).toBeNull();
  });

  it("verteilt die Heatmap auf Wochentag × Stunde, bezogen auf Arbeitstage", () => {
    const report = analyzePatterns(
      [
        entry("2026-10-05T08:30:00+02:00", "2026-10-05T10:00:00+02:00"), // Mo
        entry("2026-10-12T09:00:00+02:00", "2026-10-12T09:30:00+02:00"), // Mo
      ],
      { ...range, holidays: {} },
    );
    const monday = report.heatmap[0];
    expect(monday.weekday).toBe(1);
    expect(monday.days).toBe(2);
    expect(monday.minutes[8]).toBe(30);
    expect(monday.minutes[9]).toBe(90);
    expect(monday.share[8]).toBeCloseTo(30 / 120);
    expect(monday.share[9]).toBeCloseTo(90 / 120);
    expect(monday.share[10]).toBe(0);
    expect(report.heatmap[6].weekday).toBe(0);
    expect(report.heatmap[6].share.every((s) => s === 0)).toBe(true);
  });

  it("verteilt die Heatmap am Sommerzeitende auf die doppelte Stunde", () => {
    const report = analyzePatterns(
      [entry("2026-10-24T22:00:00+02:00", "2026-10-25T05:00:00+01:00")],
      { ...range, holidays: {} },
    );
    const saturday = report.heatmap[5];
    const sunday = report.heatmap[6];
    expect(saturday.minutes[22]).toBe(60);
    expect(saturday.minutes[23]).toBe(60);
    expect(sunday.minutes.slice(0, 5)).toEqual([60, 60, 120, 60, 60]);
    // Kalendertage mit Arbeit: Sa und So je einer
    expect(saturday.days).toBe(1);
    expect(sunday.days).toBe(1);
  });

  it("verteilt die Heatmap am Sommerzeitbeginn ohne die fehlende Stunde", () => {
    const report = analyzePatterns(
      [entry("2026-03-28T22:00:00+01:00", "2026-03-29T05:00:00+02:00")],
      { from: "2026-03-01", to: "2026-03-31", holidays: {} },
    );
    expect(report.heatmap[6].minutes.slice(0, 5)).toEqual([60, 60, 0, 60, 60]);
  });

  it("bildet Histogramme in 30-Minuten-Schritten über den belegten Bereich", () => {
    const report = analyzePatterns(
      [
        entry("2026-10-05T08:10:00+02:00", "2026-10-05T16:00:00+02:00"),
        entry("2026-10-06T08:20:00+02:00", "2026-10-06T16:40:00+02:00"),
        entry("2026-10-07T09:05:00+02:00", "2026-10-07T17:00:00+02:00"),
      ],
      { ...range, holidays: {} },
    );
    expect(report.histogram.bucketMinutes).toBe(30);
    expect(report.histogram.start).toEqual([
      { minute: 480, count: 2 },
      { minute: 510, count: 0 },
      { minute: 540, count: 1 },
    ]);
    expect(report.histogram.end).toEqual([
      { minute: 960, count: 1 },
      { minute: 990, count: 1 },
      { minute: 1020, count: 1 },
    ]);
  });

  it("zählt ausgeschlossene Einträge im Zeitraum", () => {
    const report = analyzePatterns(
      [
        entry("2026-10-05T09:00:00+02:00", "2026-10-05T17:00:00+02:00", {
          source: "BULK_FILL",
        }),
        entry("2026-10-06T09:00:00+02:00", "2026-10-06T17:00:00+02:00", {
          source: "BULK_FILL",
        }),
        // Saldo wie von /api/time-entries/adjustment angelegt: Beginn = Ende
        entry("2026-10-01T00:00:00+02:00", "2026-10-01T00:00:00+02:00", {
          type: "OVERTIME",
          source: "ADJUSTMENT",
        }),
        entry("2026-09-30T09:00:00+02:00", "2026-09-30T17:00:00+02:00", {
          source: "BULK_FILL",
        }),
        entry("2026-10-07T09:00:00+02:00", "2026-10-07T09:00:00+02:00"),
      ],
      { ...range, holidays: {} },
    );
    expect(report.excluded).toEqual({
      bulkFillDays: 2,
      adjustmentEntries: 1,
      invalidEntries: 1,
    });
  });

  describe("Arbeitszeitgesetz-Hinweise", () => {
    function findingsFor(entries: PatternSourceEntry[], holidays = {}) {
      return analyzePatterns(entries, { ...range, holidays }).findings;
    }

    it("§3: meldet erst mehr als 10 Stunden netto", () => {
      // 10:00 netto mit 45 min Pause → kein Hinweis
      expect(
        findingsFor([
          entry("2026-10-05T07:00:00+02:00", "2026-10-05T12:00:00+02:00"),
          entry("2026-10-05T12:45:00+02:00", "2026-10-05T17:45:00+02:00"),
        ]),
      ).toEqual([]);
      const findings = findingsFor([
        entry("2026-10-05T07:00:00+02:00", "2026-10-05T12:00:00+02:00"),
        entry("2026-10-05T12:45:00+02:00", "2026-10-05T17:46:00+02:00"),
      ]);
      expect(findings).toEqual([
        expect.objectContaining({
          date: "2026-10-05",
          rule: "dailyMax",
          netMinutes: 601,
          isoYear: 2026,
          isoWeek: 41,
        }),
      ]);
    });

    it("§4: genau 6:00 ohne Pause ist unauffällig, 6:01 nicht", () => {
      expect(
        findingsFor([
          entry("2026-10-05T08:00:00+02:00", "2026-10-05T14:00:00+02:00"),
        ]),
      ).toEqual([]);
      expect(
        findingsFor([
          entry("2026-10-05T08:00:00+02:00", "2026-10-05T14:01:00+02:00"),
        ]),
      ).toEqual([
        expect.objectContaining({
          rule: "breaks",
          requiredBreakMinutes: 30,
          qualifyingBreakMinutes: 0,
          insufficientBreak: true,
          longStretch: true,
        }),
      ]);
    });

    it("§4: drei Pausen à 10 Minuten zählen bei 7 Stunden nicht", () => {
      const findings = findingsFor([
        entry("2026-10-05T08:00:00+02:00", "2026-10-05T10:20:00+02:00"),
        entry("2026-10-05T10:30:00+02:00", "2026-10-05T12:50:00+02:00"),
        entry("2026-10-05T13:00:00+02:00", "2026-10-05T14:10:00+02:00"),
        entry("2026-10-05T14:20:00+02:00", "2026-10-05T15:30:00+02:00"),
      ]);
      expect(findings).toEqual([
        expect.objectContaining({
          rule: "breaks",
          netMinutes: 420,
          requiredBreakMinutes: 30,
          qualifyingBreakMinutes: 0,
          insufficientBreak: true,
        }),
      ]);
    });

    it("§4: 30 Minuten Pause reichen bei 7 Stunden", () => {
      expect(
        findingsFor([
          entry("2026-10-05T08:00:00+02:00", "2026-10-05T12:00:00+02:00"),
          entry("2026-10-05T12:30:00+02:00", "2026-10-05T15:30:00+02:00"),
        ]),
      ).toEqual([]);
    });

    it("§4: genau 9:00 braucht 30, 9:01 braucht 45 Minuten", () => {
      expect(
        findingsFor([
          entry("2026-10-05T07:00:00+02:00", "2026-10-05T12:00:00+02:00"),
          entry("2026-10-05T12:30:00+02:00", "2026-10-05T16:30:00+02:00"),
        ]),
      ).toEqual([]);
      expect(
        findingsFor([
          entry("2026-10-05T07:00:00+02:00", "2026-10-05T12:00:00+02:00"),
          entry("2026-10-05T12:30:00+02:00", "2026-10-05T16:31:00+02:00"),
        ]),
      ).toEqual([
        expect.objectContaining({
          rule: "breaks",
          netMinutes: 541,
          requiredBreakMinutes: 45,
          qualifyingBreakMinutes: 30,
          insufficientBreak: true,
          longStretch: false,
        }),
      ]);
    });

    it("§4: meldet mehr als 6 Stunden am Stück trotz ausreichender Pausensumme", () => {
      const findings = findingsFor([
        entry("2026-10-05T07:00:00+02:00", "2026-10-05T13:30:00+02:00"),
        entry("2026-10-05T14:00:00+02:00", "2026-10-05T15:00:00+02:00"),
        entry("2026-10-05T15:15:00+02:00", "2026-10-05T16:30:00+02:00"),
      ]);
      expect(findings).toEqual([
        expect.objectContaining({
          rule: "breaks",
          insufficientBreak: false,
          longStretch: true,
          longestStretchMinutes: 390,
        }),
      ]);
    });

    it("§5: meldet weniger als 11 Stunden Ruhezeit am Folgetag", () => {
      const findings = findingsFor([
        entry("2026-10-05T14:00:00+02:00", "2026-10-05T22:30:00+02:00"),
        entry("2026-10-06T08:00:00+02:00", "2026-10-06T12:00:00+02:00"),
        entry("2026-10-06T17:00:00+02:00", "2026-10-06T20:00:00+02:00"),
        // genau 11:00 Ruhezeit: unauffällig
        entry("2026-10-07T07:00:00+02:00", "2026-10-07T08:00:00+02:00"),
      ]);
      expect(findings.filter((f) => f.rule === "rest")).toEqual([
        expect.objectContaining({
          date: "2026-10-06",
          restMinutes: 570,
          previousDate: "2026-10-05",
        }),
      ]);
    });

    it("§5: rechnet die Ruhezeit über den Sommerzeitwechsel in echter Zeit", () => {
      // 24.10. Ende 23:00 MESZ, 25.10. Beginn 09:00 MEZ → 11 h echte Zeit
      expect(
        findingsFor([
          entry("2026-10-24T18:00:00+02:00", "2026-10-24T23:00:00+02:00"),
          entry("2026-10-25T09:00:00+01:00", "2026-10-25T10:00:00+01:00"),
        ]).filter((f) => f.rule === "rest"),
      ).toEqual([]);
    });

    it("§9: meldet Sonntagsarbeit nach Kalendertag, auch nach Mitternacht", () => {
      const findings = findingsFor([
        entry("2026-10-10T23:00:00+02:00", "2026-10-11T01:00:00+02:00"), // Sa → So
        entry("2026-10-18T10:00:00+02:00", "2026-10-18T11:30:00+02:00"), // So
      ]);
      const sunday = findings.filter((f) => f.rule === "sundayHoliday");
      expect(sunday).toEqual([
        expect.objectContaining({
          date: "2026-10-18",
          workedMinutes: 90,
          isSunday: true,
          holidayName: null,
          isoWeek: 42,
        }),
        expect.objectContaining({
          date: "2026-10-11",
          workedMinutes: 60,
          isSunday: true,
          isoWeek: 41,
        }),
      ]);
    });

    it("§9: meldet Arbeit an Feiertagen", () => {
      const findings = findingsFor(
        [entry("2026-10-03T10:00:00+02:00", "2026-10-03T12:00:00+02:00")],
        { "2026-10-03": "Tag der Deutschen Einheit" },
      );
      expect(findings).toEqual([
        expect.objectContaining({
          date: "2026-10-03",
          rule: "sundayHoliday",
          isSunday: false,
          holidayName: "Tag der Deutschen Einheit",
          workedMinutes: 120,
        }),
      ]);
    });

    it("sortiert Hinweise neueste zuerst und zählt je Regel", () => {
      const report = analyzePatterns(
        [
          entry("2026-10-05T07:00:00+02:00", "2026-10-05T18:00:00+02:00"),
          entry("2026-10-18T10:00:00+02:00", "2026-10-18T11:00:00+02:00"),
        ],
        { ...range, holidays: {} },
      );
      expect(report.findings.map((f) => [f.date, f.rule])).toEqual([
        ["2026-10-18", "sundayHoliday"],
        ["2026-10-05", "dailyMax"],
        ["2026-10-05", "breaks"],
      ]);
      expect(report.findingCounts).toEqual({
        dailyMax: 1,
        breaks: 1,
        rest: 0,
        sundayHoliday: 1,
      });
      expect(report.findingDays).toBe(2);
    });
  });
});

describe("describeFinding", () => {
  it("formuliert die Hinweise auf Deutsch", () => {
    const base = { date: "2026-10-05", isoYear: 2026, isoWeek: 41 };
    expect(
      describeFinding({ ...base, rule: "dailyMax", netMinutes: 645 }),
    ).toBe("10:45 netto gearbeitet (mehr als 10 Stunden)");
    expect(
      describeFinding({
        ...base,
        rule: "breaks",
        netMinutes: 420,
        requiredBreakMinutes: 30,
        qualifyingBreakMinutes: 15,
        insufficientBreak: true,
        longStretch: false,
        longestStretchMinutes: 300,
      }),
    ).toBe("0:15 Pause bei 7:00 netto (vorgesehen: mindestens 0:30)");
    expect(
      describeFinding({
        ...base,
        rule: "breaks",
        netMinutes: 420,
        requiredBreakMinutes: 30,
        qualifyingBreakMinutes: 30,
        insufficientBreak: false,
        longStretch: true,
        longestStretchMinutes: 390,
      }),
    ).toBe("6:30 am Stück ohne Pause von mindestens 15 Minuten");
    expect(
      describeFinding({
        ...base,
        rule: "rest",
        restMinutes: 570,
        previousDate: "2026-10-04",
      }),
    ).toBe("9:30 Ruhezeit seit Arbeitsende am So 04.10.");
    expect(
      describeFinding({
        ...base,
        rule: "sundayHoliday",
        workedMinutes: 90,
        isSunday: true,
        holidayName: null,
      }),
    ).toBe("1:30 am Sonntag gearbeitet");
    expect(
      describeFinding({
        ...base,
        rule: "sundayHoliday",
        workedMinutes: 120,
        isSunday: false,
        holidayName: "Tag der Deutschen Einheit",
      }),
    ).toBe("2:00 am Feiertag gearbeitet (Tag der Deutschen Einheit)");
  });
});

describe("formatClock", () => {
  it("zeigt Uhrzeiten nach Mitternacht mit Folgetag-Markierung", () => {
    expect(formatClock(8 * 60 + 5)).toBe("08:05");
    expect(formatClock(1440)).toBe("00:00 (+1)");
    expect(formatClock(25.5 * 60)).toBe("01:30 (+1)");
    expect(formatClock(8 * 60 + 29.6)).toBe("08:30");
    expect(formatClock(null)).toBe("—");
  });
});
