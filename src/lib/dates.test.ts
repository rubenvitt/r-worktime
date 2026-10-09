import { describe, expect, it } from "vitest";
import {
  berlinDateKey,
  berlinDayStart,
  dateKeyFromDbDate,
  dateKeyFromIsoTimestamp,
  isDateKey,
  monthEndKey,
  monthRange,
  shiftDateKey,
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
