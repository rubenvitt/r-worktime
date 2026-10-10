import { describe, expect, it } from "vitest";
import {
  convertPeriod,
  currentPeriod,
  isFuturePeriod,
  isPeriodKind,
  isSamePeriod,
  parsePeriod,
  parsePeriodParams,
  parseReportYear,
  periodBounds,
  periodContaining,
  periodLabel,
  periodMonths,
  periodPhrase,
  periodSearchParams,
  periodShortLabel,
  shiftPeriod,
  shortMonthName,
  trendWindow,
} from "./period";

describe("parsePeriod", () => {
  it("parst Monat, Quartal und Jahr und lehnt Unsinn ab", () => {
    expect(parsePeriod("month", "2026-10")).toEqual({
      kind: "month",
      key: "2026-10",
    });
    expect(parsePeriod("quarter", "2026-Q4")).toEqual({
      kind: "quarter",
      key: "2026-Q4",
    });
    expect(parsePeriod("year", "2026")).toEqual({ kind: "year", key: "2026" });
    expect(parsePeriod("month", "2026-13")).toBeNull();
    expect(parsePeriod("quarter", "2026-Q5")).toBeNull();
    expect(parsePeriod("quarter", "2026-10")).toBeNull();
    expect(parsePeriod("year", "26")).toBeNull();
    expect(parsePeriod("week", "2026")).toBeNull();
    expect(parsePeriod("year", null)).toBeNull();
  });

  it("begrenzt das Jahr auf 2000–2100", () => {
    expect(parsePeriod("year", "1999")).toBeNull();
    expect(parsePeriod("month", "2101-01")).toBeNull();
    expect(parseReportYear("2000")).toBe(2000);
    expect(parseReportYear("abc")).toBeNull();
  });

  it("kennt die Arten", () => {
    expect(isPeriodKind("quarter")).toBe(true);
    expect(isPeriodKind("last90")).toBe(false);
    expect(isPeriodKind(null)).toBe(false);
  });
});

describe("Monate und Grenzen", () => {
  it("liefert Monate und inklusive Grenzen", () => {
    expect(periodMonths({ kind: "month", key: "2026-02" })).toEqual([
      "2026-02",
    ]);
    expect(periodMonths({ kind: "quarter", key: "2026-Q4" })).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
    expect(periodMonths({ kind: "year", key: "2026" })).toHaveLength(12);
    expect(periodBounds({ kind: "quarter", key: "2028-Q1" })).toEqual({
      firstKey: "2028-01-01",
      lastKey: "2028-03-31",
    });
    expect(periodBounds({ kind: "month", key: "2028-02" })).toEqual({
      firstKey: "2028-02-01",
      lastKey: "2028-02-29",
    });
  });
});

describe("Verschieben und Umwandeln", () => {
  it("verschiebt über Jahresgrenzen", () => {
    expect(shiftPeriod({ kind: "quarter", key: "2026-Q1" }, -1)).toEqual({
      kind: "quarter",
      key: "2025-Q4",
    });
    expect(shiftPeriod({ kind: "quarter", key: "2026-Q4" }, 1)).toEqual({
      kind: "quarter",
      key: "2027-Q1",
    });
    expect(shiftPeriod({ kind: "month", key: "2026-01" }, -1)).toEqual({
      kind: "month",
      key: "2025-12",
    });
    expect(shiftPeriod({ kind: "year", key: "2026" }, -2)).toEqual({
      kind: "year",
      key: "2024",
    });
  });

  it("bleibt beim Wechsel der Art im angezeigten Zeitraum", () => {
    const today = "2026-10-10";
    expect(
      convertPeriod({ kind: "month", key: "2025-08" }, "quarter", today),
    ).toEqual({ kind: "quarter", key: "2025-Q3" });
    expect(
      convertPeriod({ kind: "quarter", key: "2025-Q3" }, "month", today),
    ).toEqual({ kind: "month", key: "2025-07" });
    // enthält der Zeitraum heute, gilt der laufende Zeitraum der neuen Art
    expect(
      convertPeriod({ kind: "year", key: "2026" }, "month", today),
    ).toEqual({ kind: "month", key: "2026-10" });
    expect(
      convertPeriod({ kind: "year", key: "2025" }, "month", today),
    ).toEqual({ kind: "month", key: "2025-01" });
  });

  it("bestimmt den laufenden Zeitraum in Berlin", () => {
    // 31.12.2026 23:30 UTC = 01.01.2027 00:30 in Berlin
    const now = new Date("2026-12-31T23:30:00Z");
    expect(currentPeriod("month", now).key).toBe("2027-01");
    expect(currentPeriod("quarter", now).key).toBe("2027-Q1");
    expect(currentPeriod("year", now).key).toBe("2027");
    expect(periodContaining("quarter", "2026-03-31").key).toBe("2026-Q1");
  });

  it("vergleicht und erkennt Zukunft", () => {
    expect(
      isSamePeriod(
        { kind: "quarter", key: "2026-Q4" },
        { kind: "quarter", key: "2026-Q4" },
      ),
    ).toBe(true);
    expect(
      isSamePeriod(
        { kind: "year", key: "2026" },
        { kind: "month", key: "2026" },
      ),
    ).toBe(false);
    expect(
      isFuturePeriod({ kind: "month", key: "2026-11" }, "2026-10-10"),
    ).toBe(true);
    expect(isFuturePeriod({ kind: "year", key: "2026" }, "2026-10-10")).toBe(
      false,
    );
  });
});

describe("Beschriftung", () => {
  it("benennt Zeiträume auf Deutsch", () => {
    expect(periodLabel({ kind: "month", key: "2026-10" })).toBe("Oktober 2026");
    expect(periodLabel({ kind: "quarter", key: "2026-Q4" })).toBe(
      "4. Quartal 2026",
    );
    expect(periodLabel({ kind: "year", key: "2026" })).toBe("2026");
    expect(periodShortLabel({ kind: "month", key: "2026-10" })).toBe(
      "Okt 2026",
    );
    expect(periodShortLabel({ kind: "quarter", key: "2026-Q4" })).toBe(
      "Q4 2026",
    );
    expect(periodPhrase({ kind: "month", key: "2026-10" })).toBe(
      "im Oktober 2026",
    );
    expect(periodPhrase({ kind: "quarter", key: "2026-Q4" })).toBe(
      "im 4. Quartal 2026",
    );
    expect(periodPhrase({ kind: "year", key: "2026" })).toBe("im Jahr 2026");
    expect(shortMonthName("2026-03")).toBe("Mär");
    expect(shortMonthName("2026-10")).toBe("Okt");
  });
});

describe("URL", () => {
  it("liest und schreibt ?period&key", () => {
    const period = { kind: "quarter", key: "2026-Q3" } as const;
    expect(periodSearchParams(period).toString()).toBe(
      "period=quarter&key=2026-Q3",
    );
    expect(parsePeriodParams(periodSearchParams(period))).toEqual(period);
    expect(parsePeriodParams(new URLSearchParams("period=month"))).toBeNull();
  });
});

describe("trendWindow", () => {
  it("endet mit dem Zeitraum, höchstens mit dem laufenden Monat", () => {
    const march = trendWindow({ kind: "month", key: "2026-03" }, "2026-10-10");
    expect(march).toHaveLength(12);
    expect(march[0]).toBe("2025-04");
    expect(march.at(-1)).toBe("2026-03");
    const year = trendWindow({ kind: "year", key: "2026" }, "2026-10-10");
    expect(year[0]).toBe("2025-11");
    expect(year.at(-1)).toBe("2026-10");
  });
});
