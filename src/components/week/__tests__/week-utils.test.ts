import { describe, expect, it } from "vitest";
import {
  chartMonths,
  groupMonths,
  monthRangeLabel,
} from "@/components/overview/overtime-utils";
import {
  currentIsoWeek,
  dayKeyOf,
  formatWeekRange,
  isoWeekMonday,
  overlappingIds,
  shiftIsoWeek,
} from "../week-utils";

describe("ISO-Wochen", () => {
  it("findet den Montag einer ISO-Woche", () => {
    expect(isoWeekMonday(2026, 40)).toBe("2026-09-28");
    expect(isoWeekMonday(2026, 1)).toBe("2025-12-29");
    expect(isoWeekMonday(2020, 53)).toBe("2020-12-28");
  });

  it("verschiebt über den Jahreswechsel", () => {
    expect(shiftIsoWeek(2026, 1, -1)).toEqual({ year: 2025, week: 52 });
    expect(shiftIsoWeek(2020, 53, 1)).toEqual({ year: 2021, week: 1 });
    expect(shiftIsoWeek(2026, 40, 1)).toEqual({ year: 2026, week: 41 });
  });

  it("nimmt den Berliner Kalendertag für die aktuelle Woche", () => {
    // So 04.10.2026, 23:30 Berlin = 21:30 UTC → noch KW 40
    expect(currentIsoWeek(new Date("2026-10-04T21:30:00Z"))).toEqual({
      year: 2026,
      week: 40,
    });
    // Mo 05.10.2026, 00:30 Berlin = So 22:30 UTC → schon KW 41
    expect(currentIsoWeek(new Date("2026-10-04T22:30:00Z"))).toEqual({
      year: 2026,
      week: 41,
    });
  });

  it("ordnet lokale Mitternachten dem Berliner Tag zu", () => {
    expect(dayKeyOf("2026-09-27T22:00:00.000Z")).toBe("2026-09-28");
    expect(dayKeyOf("2026-10-07T00:00:00.000Z")).toBe("2026-10-07");
  });

  it("beschriftet den Zeitraum", () => {
    expect(formatWeekRange("2026-09-28", "2026-10-04")).toBe(
      "28.09.–04.10.2026",
    );
  });
});

describe("Überschneidungen", () => {
  it("markiert nur echte Überlappungen", () => {
    const ids = overlappingIds([
      {
        id: "a",
        startTime: "2026-09-30T07:00:00Z",
        endTime: "2026-09-30T09:00:00Z",
      },
      {
        id: "b",
        startTime: "2026-09-30T08:30:00Z",
        endTime: "2026-09-30T10:00:00Z",
      },
      {
        id: "c",
        startTime: "2026-09-30T10:00:00Z",
        endTime: "2026-09-30T11:00:00Z",
      },
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
});

describe("Monate auf /overtime", () => {
  const month = (
    monthIndex: number,
    actualHours: number,
    targetHours: number,
  ) => ({
    monthIndex,
    month: `M${monthIndex}`,
    actualHours,
    targetHours,
    overtimeHours: actualHours - targetHours,
  });
  const months = [
    month(0, 12.5, 0),
    ...[1, 2, 3, 4, 5, 6].map((i) => month(i, 0, 0)),
    month(7, 162.5, 160),
    month(8, 171.75, 176),
    month(9, 51.75, 176),
  ];

  it("klappt leere Monate vor dem Erfassungsbeginn ein", () => {
    const rows = groupMonths(months, 2026, "2026-08-03");
    expect(
      rows.map((r) => (r.kind === "month" ? r.month.monthIndex : r.label)),
    ).toEqual([0, "Feb – Jul", 7, 8, 9]);
  });

  it("klappt ohne Erfassungsbeginn nichts ein", () => {
    expect(groupMonths(months, 2026, null)).toHaveLength(months.length);
  });

  it("zeigt im Diagramm Monate ab Erfassungsbeginn bzw. mit Ist", () => {
    expect(
      chartMonths(months, 2026, "2026-08-03").map((m) => m.monthIndex),
    ).toEqual([7, 8, 9]);
    expect(chartMonths(months, 2026, null).map((m) => m.monthIndex)).toEqual([
      0, 7, 8, 9,
    ]);
  });

  it("beschriftet Gruppen", () => {
    expect(monthRangeLabel([1])).toBe("Feb");
    expect(monthRangeLabel([1, 2, 3])).toBe("Feb – Apr");
  });
});
