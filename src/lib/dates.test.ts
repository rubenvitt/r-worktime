import { describe, expect, it } from "vitest";
import {
  berlinDateKey,
  berlinDayStart,
  dateKeyFromDbDate,
  dateKeyFromIsoTimestamp,
  isDateKey,
  isoWeekMonday,
  isoWeekOf,
  isoWeekRange,
  isoWeeksInYear,
  isValidIsoWeek,
  monthEndKey,
  monthRange,
  monthsEndingAt,
  shiftDateKey,
  shiftIsoWeek,
  shiftMonthKey,
  weekdayOfKey,
} from "./dates";

describe("berlinDateKey", () => {
  it("ordnet 00:30 Berlin (Sommerzeit) dem Berlin-Tag zu, nicht dem UTC-Tag", () => {
    // 2025-09-01 00:30 CEST = 2025-08-31 22:30 UTC
    expect(berlinDateKey(new Date("2025-08-31T22:30:00Z"))).toBe("2025-09-01");
  });

  it("ordnet 00:30 Berlin (Winterzeit) dem Berlin-Tag zu", () => {
    // 2025-01-15 00:30 CET = 2025-01-14 23:30 UTC
    expect(berlinDateKey(new Date("2025-01-14T23:30:00Z"))).toBe("2025-01-15");
  });

  it("lässt 23:30 Berlin am selben Tag", () => {
    expect(berlinDateKey(new Date("2025-09-01T21:30:00Z"))).toBe("2025-09-01");
    expect(berlinDateKey(new Date("2025-01-15T22:30:00Z"))).toBe("2025-01-15");
  });

  it("wirft bei ungültigem Datum", () => {
    expect(() => berlinDateKey(new Date("kaputt"))).toThrow();
  });
});

describe("berlinDayStart", () => {
  it("liefert UTC-Mitternacht des Keys", () => {
    expect(berlinDayStart("2025-09-01").toISOString()).toBe(
      "2025-09-01T00:00:00.000Z",
    );
    expect(dateKeyFromDbDate(berlinDayStart("2024-02-29"))).toBe("2024-02-29");
  });

  it("lehnt ungültige Keys ab", () => {
    expect(() => berlinDayStart("2025-02-30")).toThrow();
    expect(() => berlinDayStart("2025-9-1")).toThrow();
    expect(isDateKey("2025-13-01")).toBe(false);
  });
});

describe("dateKeyFromIsoTimestamp", () => {
  it("nutzt den Berlin-Tag bei UTC-Zeitstempeln", () => {
    expect(dateKeyFromIsoTimestamp("2025-08-31T22:30:00.000Z")).toBe(
      "2025-09-01",
    );
  });

  it("nutzt den Berlin-Tag bei Offset-Zeitstempeln", () => {
    expect(dateKeyFromIsoTimestamp("2025-09-01T00:30:00+02:00")).toBe(
      "2025-09-01",
    );
    expect(dateKeyFromIsoTimestamp("2025-09-01T00:30:00.000000+00:00")).toBe(
      "2025-09-01",
    );
    expect(dateKeyFromIsoTimestamp("2025-09-01T23:30:00+00:00")).toBe(
      "2025-09-02",
    );
  });

  it("übernimmt das Datum bei Zeitstempeln ohne Offset", () => {
    expect(dateKeyFromIsoTimestamp("2025-09-01T00:30:00")).toBe("2025-09-01");
  });

  it("wirft bei Unsinn", () => {
    expect(() => dateKeyFromIsoTimestamp("kaputt")).toThrow();
  });
});

describe("shiftDateKey", () => {
  it("verschiebt über Monats- und Jahresgrenzen", () => {
    expect(shiftDateKey("2025-03-01", -1)).toBe("2025-02-28");
    expect(shiftDateKey("2025-12-31", 1)).toBe("2026-01-01");
    expect(shiftDateKey("2025-10-26", 0)).toBe("2025-10-26");
  });
});

describe("monthRange", () => {
  it("liefert inklusive Monatsgrenzen", () => {
    const range = monthRange("2024-02");
    expect(range.firstKey).toBe("2024-02-01");
    expect(range.lastKey).toBe("2024-02-29");
    expect(range.start.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });

  it("lehnt ungültige Monate ab", () => {
    expect(() => monthRange("2025-13")).toThrow();
    expect(() => monthRange("2025-1")).toThrow();
  });
});

describe("monthEndKey", () => {
  it("liefert den Monatsletzten ohne Verschiebung durch die Zeitzone", () => {
    expect(monthEndKey(2026, 8)).toBe("2026-09-30");
    expect(monthEndKey(2024, 1)).toBe("2024-02-29");
    expect(monthEndKey(2026, 11)).toBe("2026-12-31");
  });
});

describe("shiftMonthKey / monthsEndingAt", () => {
  it("verschiebt Monate über Jahresgrenzen", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-10", -22)).toBe("2024-12");
    expect(shiftMonthKey("2026-10", 0)).toBe("2026-10");
  });

  it("liefert count Monate bis einschließlich Endmonat", () => {
    expect(monthsEndingAt("2026-02", 3)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(monthsEndingAt("2026-10", 12)).toHaveLength(12);
  });
});

describe("ISO-8601-Kalenderwochen", () => {
  it("ordnet den Jahreswechsel 28.12.2026–04.01.2027 nach Norm zu", () => {
    expect(isoWeekOf("2026-12-27")).toEqual({ year: 2026, week: 52 });
    expect(isoWeekOf("2026-12-28")).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf("2026-12-31")).toEqual({ year: 2026, week: 53 });
    // 1.–3. Januar 2027 gehören noch zur KW 53 des Wochenjahrs 2026
    expect(isoWeekOf("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf("2027-01-03")).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf("2027-01-04")).toEqual({ year: 2027, week: 1 });
  });

  it("kennt Jahre mit 53 Wochen", () => {
    expect(isoWeeksInYear(2026)).toBe(53);
    expect(isoWeeksInYear(2020)).toBe(53);
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2027)).toBe(52);
    expect(isValidIsoWeek(2026, 53)).toBe(true);
    expect(isValidIsoWeek(2027, 53)).toBe(false);
    expect(isValidIsoWeek(2026, 0)).toBe(false);
    expect(isValidIsoWeek(2026, 1.5)).toBe(false);
  });

  it("lässt KW 1 im Vorjahr beginnen, wenn der 1. Januar kein Mo–Do ist", () => {
    // 01.01.2026 ist ein Donnerstag → KW 1 beginnt Mo 29.12.2025
    expect(isoWeekOf("2025-12-29")).toEqual({ year: 2026, week: 1 });
    expect(isoWeekMonday(2026, 1)).toBe("2025-12-29");
    // 01.01.2025 ist ein Mittwoch → KW 1 beginnt Mo 30.12.2024
    expect(isoWeekMonday(2025, 1)).toBe("2024-12-30");
    // 01.01.2027 ist ein Freitag → KW 1 beginnt erst Mo 04.01.2027
    expect(isoWeekMonday(2027, 1)).toBe("2027-01-04");
  });

  it("liefert die Grenzen einer Woche für @db.Date-Abfragen", () => {
    const range = isoWeekRange(2026, 53);
    expect(range.firstKey).toBe("2026-12-28");
    expect(range.lastKey).toBe("2027-01-03");
    expect(range.dayKeys).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(range.start.toISOString()).toBe("2026-12-28T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2027-01-03T00:00:00.000Z");

    const first = isoWeekRange(2026, 1);
    expect(first.firstKey).toBe("2025-12-29");
    expect(first.lastKey).toBe("2026-01-04");
  });

  it("wirft bei Wochen, die es im Jahr nicht gibt", () => {
    expect(() => isoWeekRange(2027, 53)).toThrow(RangeError);
    expect(() => isoWeekRange(2026, 54)).toThrow(RangeError);
  });

  it("verschiebt über den Jahreswechsel", () => {
    expect(shiftIsoWeek(2026, 53, 1)).toEqual({ year: 2027, week: 1 });
    expect(shiftIsoWeek(2027, 1, -1)).toEqual({ year: 2026, week: 53 });
    expect(shiftIsoWeek(2026, 1, -1)).toEqual({ year: 2025, week: 52 });
  });

  it("liefert den Wochentag wie UserSettings.workDays", () => {
    expect(weekdayOfKey("2026-12-28")).toBe(1); // Montag
    expect(weekdayOfKey("2027-01-03")).toBe(0); // Sonntag
    expect(weekdayOfKey("2026-10-10")).toBe(6); // Samstag
  });
});
