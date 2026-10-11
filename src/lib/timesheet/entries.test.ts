import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { aggregateTimesheet, buildTimesheetPayload } from "./aggregate";
import {
  effectiveEndTime,
  entryTitle,
  expandProjectRoots,
  filterTimesheetEntries,
  formatBerlinIso,
  formatDurationHms,
  type TimesheetSourceEntry,
  toTimesheetRecord,
  toTimingExportEntry,
} from "./entries";
import { parseTimesheetQuery } from "./query";
import { rTimesCopyAllAsJson, rTimesProcessData } from "./rtimes-reference";

let counter = 0;
function entry(overrides: Partial<TimesheetSourceEntry>): TimesheetSourceEntry {
  counter += 1;
  return {
    id: `e${counter}`,
    startTime: new Date("2026-09-01T06:00:00Z"),
    endTime: new Date("2026-09-01T07:00:00Z"),
    type: "WORK",
    source: "TIMING_SYNC",
    title: "Alpha | 101: Backend",
    notes: "API-Design",
    description: "Alpha | 101: Backend - API-Design",
    projectPath: "Work ▸ Firma ▸ Kunde A",
    billingStatus: "Billable",
    ...overrides,
  };
}

const baseFilter = { month: "2026-09", root: null, includeAbsences: false };

describe("filterTimesheetEntries", () => {
  it("wirft den Saldo raus – per source und per Textmarker", () => {
    const kept = entry({});
    const result = filterTimesheetEntries(
      [
        kept,
        entry({ source: "ADJUSTMENT" }),
        entry({
          source: "MANUAL",
          description: "Anfangs-Überstunden-Saldo: 12h",
        }),
      ],
      baseFilter,
    );
    expect(result).toEqual([kept]);
  });

  it("nimmt Abwesenheiten nur auf Wunsch mit", () => {
    const work = entry({});
    const overtime = entry({ type: "OVERTIME" });
    const vacation = entry({ type: "VACATION" });
    const holiday = entry({ type: "HOLIDAY", source: "HOLIDAY" });
    const reduction = entry({ type: "OVERTIME_REDUCTION", source: "TIMEWARP" });
    const unpaid = entry({ type: "UNPAID_LEAVE", source: "TIMEWARP" });
    const all = [work, overtime, vacation, holiday, reduction, unpaid];
    expect(filterTimesheetEntries(all, baseFilter)).toEqual([work, overtime]);
    expect(
      filterTimesheetEntries(all, { ...baseFilter, includeAbsences: true }),
    ).toEqual(all);
  });

  it("filtert segmentweise nach Projekt-Teilbaum", () => {
    const customer = entry({});
    const other = entry({ projectPath: "Work ▸ Firma ▸ Kunde B" });
    const workshop = entry({ projectPath: "Workshop ▸ Privat" });
    const none = entry({ projectPath: null });
    const all = [customer, other, workshop, none];

    expect(
      filterTimesheetEntries(all, { ...baseFilter, root: "Work" }),
    ).toEqual([customer, other]);
    expect(
      filterTimesheetEntries(all, {
        ...baseFilter,
        root: "Work ▸ Firma ▸ Kunde A",
      }),
    ).toEqual([customer]);
    expect(filterTimesheetEntries(all, baseFilter)).toEqual(all);
  });

  it("entscheidet den Monat nach dem Berlin-Tag des Starts", () => {
    // 2026-09-01 00:30 Berlin = 2026-08-31 22:30 UTC → September
    const firstNight = entry({
      startTime: new Date("2026-08-31T22:30:00Z"),
      endTime: new Date("2026-08-31T23:00:00Z"),
    });
    // 2026-10-01 00:30 Berlin → Oktober
    const nextMonth = entry({
      startTime: new Date("2026-09-30T22:30:00Z"),
      endTime: new Date("2026-09-30T23:00:00Z"),
    });
    const lastEvening = entry({
      startTime: new Date("2026-09-30T21:00:00Z"),
      endTime: new Date("2026-09-30T21:30:00Z"),
    });
    expect(
      filterTimesheetEntries([firstNight, nextMonth, lastEvening], baseFilter),
    ).toEqual([firstNight, lastEvening]);
  });
});

describe("Titel-Fallback", () => {
  it("title || description || projectPath || Ohne Titel", () => {
    expect(entryTitle({ title: "A", description: "B", projectPath: "C" })).toBe(
      "A",
    );
    expect(entryTitle({ title: "", description: "B", projectPath: "C" })).toBe(
      "B",
    );
    expect(
      entryTitle({ title: null, description: null, projectPath: "C" }),
    ).toBe("C");
    expect(
      entryTitle({ title: null, description: null, projectPath: null }),
    ).toBe("Ohne Titel");
    expect(toTimesheetRecord(entry({ notes: null })).notes).toBe("");
  });
});

describe("effectiveEndTime / toTimesheetRecord", () => {
  // Bulk-Fill: 7,5 h, aber Zeitfenster 09:00–17:00
  const bulk = entry({
    source: "BULK_FILL",
    startTime: new Date("2026-09-01T07:00:00Z"),
    endTime: new Date("2026-09-01T15:00:00Z"),
    duration: 7.5,
  });

  it("nimmt bei manuellen und Bulk-Fill-Einträgen die duration", () => {
    expect(effectiveEndTime(bulk).toISOString()).toBe(
      "2026-09-01T14:30:00.000Z",
    );
    const payload = buildTimesheetPayload(
      aggregateTimesheet([toTimesheetRecord(bulk)], {
        dayBoundary: "Europe/Berlin",
      }),
      15,
    );
    expect(payload[0].hours).toBe("7:30");
    expect(toTimingExportEntry(bulk).duration).toBe("7:30:00");
    expect(
      effectiveEndTime({ ...bulk, source: "MANUAL", duration: 1.33 }),
    ).toEqual(new Date("2026-09-01T08:19:48.000Z"));
  });

  it("nimmt bei Timing-Daten Ende − Start (duration ist gerundet)", () => {
    for (const source of ["TIMING_SYNC", "FILE_IMPORT"]) {
      const synced = entry({ source, duration: 0.33 });
      expect(effectiveEndTime(synced)).toEqual(synced.endTime);
    }
  });

  it("fällt ohne duration auf das gespeicherte Ende zurück", () => {
    const manual = entry({ source: "MANUAL", duration: undefined });
    expect(effectiveEndTime(manual)).toEqual(manual.endTime);
  });
});

describe("expandProjectRoots", () => {
  it("liefert alle Präfixe, dedupliziert und sortiert", () => {
    expect(
      expandProjectRoots([
        "Work ▸ Firma ▸ Kunde A",
        "Work ▸ Firma ▸ Kunde B",
        "Privat",
        null,
        "Work ▸ Intern",
      ]),
    ).toEqual([
      "Privat",
      "Work",
      "Work ▸ Firma",
      "Work ▸ Firma ▸ Kunde A",
      "Work ▸ Firma ▸ Kunde B",
      "Work ▸ Intern",
    ]);
  });
});

describe("Timing-Export", () => {
  it("formatiert ISO mit Berliner Offset (Winter/Sommer)", () => {
    expect(formatBerlinIso(new Date("2026-01-15T07:00:00Z"))).toBe(
      "2026-01-15T08:00:00+01:00",
    );
    expect(formatBerlinIso(new Date("2026-08-31T22:30:00Z"))).toBe(
      "2026-09-01T00:30:00+02:00",
    );
  });

  it("formatiert Dauer als H:MM:SS", () => {
    expect(formatDurationHms(0)).toBe("0:00:00");
    expect(formatDurationHms(3600 + 5 * 60 + 7)).toBe("1:05:07");
    expect(formatDurationHms(-5)).toBe("0:00:00");
  });

  it("bildet einen Eintrag auf das Exportformat ab", () => {
    expect(toTimingExportEntry(entry({ id: "x" }))).toEqual({
      activityTitle: "Alpha | 101: Backend",
      activityType: "Time Entry",
      billingStatus: "Billable",
      duration: "1:00:00",
      startDate: "2026-09-01T08:00:00+02:00",
      endDate: "2026-09-01T09:00:00+02:00",
      notes: "API-Design",
      project: "Work ▸ Firma ▸ Kunde A",
    });
  });

  it("Export durch r-times ergibt denselben Stundenzettel wie der Port", () => {
    const entries = [
      entry({}),
      entry({
        title: null,
        description: null,
        notes: null,
        startTime: new Date("2026-09-01T08:00:00Z"),
        endTime: new Date("2026-09-01T08:20:00Z"),
      }),
      entry({
        title: "Meetings(Daily)",
        notes: "Sync",
        startTime: new Date("2026-09-02T07:00:00Z"),
        endTime: new Date("2026-09-02T07:15:00Z"),
      }),
      entry({
        title: null,
        description: "Manueller Eintrag",
        projectPath: null,
        notes: null,
        startTime: new Date("2026-09-02T08:00:00Z"),
        endTime: new Date("2026-09-02T12:07:00Z"),
      }),
    ];
    const exported = JSON.parse(
      JSON.stringify(entries.map(toTimingExportEntry)),
    );
    const port = buildTimesheetPayload(
      aggregateTimesheet(entries.map(toTimesheetRecord), {
        dayBoundary: "UTC",
      }),
      15,
    );
    expect(port).toEqual(rTimesCopyAllAsJson(rTimesProcessData(exported), 15));
  });
});

describe("parseTimesheetQuery", () => {
  it("setzt Defaults", () => {
    const result = parseTimesheetQuery(new URLSearchParams("month=2026-09"));
    expect(result).toEqual({
      success: true,
      data: {
        month: "2026-09",
        root: null,
        rounding: 15,
        includeAbsences: false,
      },
    });
  });

  it("liest alle Parameter", () => {
    const result = parseTimesheetQuery(
      new URLSearchParams({
        month: "2026-10",
        root: "Work ▸ Firma",
        rounding: "30",
        includeAbsences: "1",
      }),
    );
    expect(result).toEqual({
      success: true,
      data: {
        month: "2026-10",
        root: "Work ▸ Firma",
        rounding: 30,
        includeAbsences: true,
      },
    });
  });

  it("lehnt ungültige Werte ab", () => {
    expect(
      parseTimesheetQuery(new URLSearchParams("rounding=20")).success,
    ).toBe(false);
    expect(
      parseTimesheetQuery(new URLSearchParams("month=2026-13")).success,
    ).toBe(false);
  });
});
