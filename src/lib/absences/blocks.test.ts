import { describe, expect, it } from "vitest";
import {
  type AbsenceRow,
  blockState,
  buildAbsenceBlocks,
  countAbsenceDays,
  type LooseEntryRow,
} from "./blocks";

// Oktober 2026: Sa 03.10. Tag der Deutschen Einheit, Mo 05.10. bis Fr 09.10.
const ctx = {
  workDays: [1, 2, 3, 4, 5],
  holidays: new Set(["2026-10-03", "2026-12-25", "2026-12-26", "2027-01-01"]),
  dailyHours: 8,
  todayKey: "2026-10-11",
};

function absence(overrides: Partial<AbsenceRow> = {}): AbsenceRow {
  return {
    id: "a1",
    source: "TIMEWARP",
    kind: "VACATION",
    startDate: "2026-10-12",
    endDate: "2026-10-16",
    halfDay: false,
    status: "ACTIVE",
    ...overrides,
  };
}

function entry(
  dateKey: string,
  overrides: Partial<LooseEntryRow> = {},
): LooseEntryRow {
  return {
    dateKey,
    type: "VACATION",
    hours: 8,
    source: "TIMING_SYNC",
    ...overrides,
  };
}

describe("countAbsenceDays", () => {
  it("zählt nur Arbeitstage ohne Feiertage", () => {
    // Mi 23.12. bis Fr 01.01.: 23., 24., 28.–31. (25. Feiertag, Wochenende raus)
    expect(countAbsenceDays("2026-12-23", "2027-01-01", false, ctx)).toBe(6);
  });

  it("zählt einen halben Tag als 0,5", () => {
    expect(countAbsenceDays("2026-10-12", "2026-10-12", true, ctx)).toBe(0.5);
  });

  it("ergibt 0 für einen Zeitraum nur am Wochenende", () => {
    expect(countAbsenceDays("2026-10-10", "2026-10-11", false, ctx)).toBe(0);
  });
});

describe("blockState", () => {
  it("ist geplant, wenn der Block nach heute beginnt", () => {
    expect(blockState("2026-10-12", "2026-10-16", false, ctx.todayKey)).toBe(
      "planned",
    );
  });

  it("ist genommen, wenn der Block heute oder früher endet", () => {
    expect(blockState("2026-10-05", "2026-10-11", false, ctx.todayKey)).toBe(
      "taken",
    );
  });

  it("ist teilweise genommen, wenn heute im Block liegt", () => {
    expect(blockState("2026-10-09", "2026-10-13", false, ctx.todayKey)).toBe(
      "partial",
    );
    expect(blockState("2026-10-11", "2026-10-13", false, ctx.todayKey)).toBe(
      "partial",
    );
  });

  it("storniert geht vor", () => {
    expect(blockState("2026-10-05", "2026-10-06", true, ctx.todayKey)).toBe(
      "cancelled",
    );
  });
});

describe("buildAbsenceBlocks", () => {
  it("übernimmt Abwesenheiten mit Tagen, Zustand und Löschbarkeit", () => {
    const blocks = buildAbsenceBlocks({
      ...ctx,
      absences: [
        absence(),
        absence({
          id: "m1",
          source: "MANUAL",
          startDate: "2026-09-01",
          endDate: "2026-09-01",
          halfDay: true,
        }),
        absence({
          id: "c1",
          kind: "SPECIAL_LEAVE",
          startDate: "2026-11-02",
          endDate: "2026-11-03",
          status: "CANCELLED",
        }),
      ],
      looseEntries: [],
    });

    expect(blocks).toEqual([
      {
        id: "m1",
        source: "MANUAL",
        kind: "VACATION",
        from: "2026-09-01",
        to: "2026-09-01",
        halfDay: true,
        status: "ACTIVE",
        state: "taken",
        days: 0.5,
        deletable: true,
      },
      {
        id: "a1",
        source: "TIMEWARP",
        kind: "VACATION",
        from: "2026-10-12",
        to: "2026-10-16",
        halfDay: false,
        status: "ACTIVE",
        state: "planned",
        days: 5,
        deletable: false,
      },
      {
        id: "c1",
        source: "TIMEWARP",
        kind: "SPECIAL_LEAVE",
        from: "2026-11-02",
        to: "2026-11-03",
        halfDay: false,
        status: "CANCELLED",
        state: "cancelled",
        days: 2,
        deletable: false,
      },
    ]);
  });

  it("fasst lose Urlaubstage über Wochenende und Feiertag zu einem Block", () => {
    const blocks = buildAbsenceBlocks({
      ...ctx,
      absences: [],
      looseEntries: [
        // Do 01.10., Fr 02.10., (Sa 03.10. Feiertag, So), Mo 05.10.
        entry("2026-10-01"),
        entry("2026-10-02"),
        entry("2026-10-05"),
      ],
    });

    expect(blocks).toEqual([
      {
        id: null,
        source: "TIMING",
        kind: "VACATION",
        from: "2026-10-01",
        to: "2026-10-05",
        halfDay: false,
        status: "ACTIVE",
        state: "taken",
        days: 3,
        deletable: false,
      },
    ]);
  });

  it("trennt Blöcke bei einem freien Arbeitstag dazwischen", () => {
    const blocks = buildAbsenceBlocks({
      ...ctx,
      absences: [],
      looseEntries: [entry("2026-10-05"), entry("2026-10-07")],
    });
    expect(blocks.map((b) => [b.from, b.to])).toEqual([
      ["2026-10-05", "2026-10-05"],
      ["2026-10-07", "2026-10-07"],
    ]);
  });

  it("summiert geteilte Einträge je Tag und rechnet halbe Tage", () => {
    const blocks = buildAbsenceBlocks({
      ...ctx,
      absences: [],
      looseEntries: [
        entry("2026-10-06", { hours: 4 }),
        entry("2026-10-06", { hours: 4 }),
        entry("2026-10-07", { hours: 4 }),
      ],
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      from: "2026-10-06",
      to: "2026-10-07",
      days: 1.5,
      halfDay: false,
    });
  });

  it("markiert einen einzelnen halben losen Tag als halben Tag", () => {
    const [block] = buildAbsenceBlocks({
      ...ctx,
      absences: [],
      looseEntries: [entry("2026-12-24", { hours: 4 })],
    });
    expect(block).toMatchObject({
      halfDay: true,
      days: 0.5,
      state: "planned",
    });
  });

  it("hält Herkunft und Art getrennt", () => {
    const blocks = buildAbsenceBlocks({
      ...ctx,
      absences: [],
      looseEntries: [
        entry("2026-10-05"),
        entry("2026-10-06", { source: "FILE_IMPORT" }),
        entry("2026-10-07", { source: "MANUAL" }),
        entry("2026-10-08", { type: "OVERTIME_REDUCTION", source: "MANUAL" }),
      ],
    });
    expect(blocks.map((b) => [b.source, b.kind, b.from, b.to])).toEqual([
      ["TIMING", "VACATION", "2026-10-05", "2026-10-06"],
      ["MANUAL", "VACATION", "2026-10-07", "2026-10-07"],
      ["MANUAL", "OVERTIME_REDUCTION", "2026-10-08", "2026-10-08"],
    ]);
    // Lose Einträge ohne Abwesenheit lassen sich nie als Block löschen
    expect(blocks.every((b) => !b.deletable && b.id === null)).toBe(true);
  });

  it("zählt lose Einträge an Nicht-Arbeitstagen nicht mit", () => {
    const [block] = buildAbsenceBlocks({
      ...ctx,
      absences: [],
      looseEntries: [entry("2026-10-09"), entry("2026-10-10")],
    });
    expect(block).toMatchObject({
      from: "2026-10-09",
      to: "2026-10-10",
      days: 1,
    });
  });

  it("ordnet Blöcke chronologisch", () => {
    const blocks = buildAbsenceBlocks({
      ...ctx,
      absences: [absence({ startDate: "2026-10-05", endDate: "2026-10-06" })],
      looseEntries: [entry("2026-08-03")],
    });
    expect(blocks.map((b) => b.from)).toEqual(["2026-08-03", "2026-10-05"]);
  });
});
