import { describe, expect, it } from "vitest";
import type { TimingApiTimeEntry } from "./client";
import {
  isHolidayProjectPath,
  type PendingHoliday,
  planHolidayPush,
  startedHolidays,
  suggestHolidayProject,
} from "./holidays";

function holiday(
  dateKey: string,
  overrides: Partial<PendingHoliday> = {},
): PendingHoliday {
  return {
    id: `h-${dateKey}`,
    dateKey,
    duration: 8,
    title: "Tag der Arbeit",
    ...overrides,
  };
}

function timingEntry(
  self: string,
  start: string,
  overrides: Partial<TimingApiTimeEntry> = {},
): TimingApiTimeEntry {
  return {
    self,
    start_date: start,
    end_date: start,
    duration: 0,
    project: { self: "/projects/9" },
    title: "Feiertag",
    notes: null,
    is_running: false,
    ...overrides,
  };
}

describe("startedHolidays", () => {
  it("nimmt nur Feiertage, deren Eintrag um 08:00 Berliner Zeit begonnen hat", () => {
    const pending = [holiday("2027-05-01"), holiday("2027-05-13")];
    // 07:59 Berliner Sommerzeit = 05:59 UTC
    expect(
      startedHolidays(pending, new Date("2027-05-01T05:59:00.000Z")),
    ).toEqual([]);
    expect(
      startedHolidays(pending, new Date("2027-05-01T06:00:00.000Z")).map(
        (h) => h.dateKey,
      ),
    ).toEqual(["2027-05-01"]);
  });

  it("überspringt Einträge ohne Dauer", () => {
    expect(
      startedHolidays(
        [holiday("2027-01-01", { duration: 0 })],
        new Date("2027-02-01T12:00:00.000Z"),
      ),
    ).toEqual([]);
  });
});

describe("planHolidayPush", () => {
  it("legt fehlende Feiertage ab 08:00 mit Tagessoll an", () => {
    const plan = planHolidayPush(
      [holiday("2027-05-01", { duration: 7.5 })],
      [],
      new Set(),
    );
    expect(plan.adopt).toEqual([]);
    expect(plan.create).toEqual([
      {
        id: "h-2027-05-01",
        dateKey: "2027-05-01",
        title: "Tag der Arbeit",
        start: new Date("2027-05-01T06:00:00.000Z"),
        end: new Date("2027-05-01T13:30:00.000Z"),
      },
    ]);
  });

  it("übernimmt einen vorhandenen Eintrag am Tag, nie einen schon verknüpften", () => {
    const plan = planHolidayPush(
      [holiday("2027-05-01"), holiday("2027-05-13")],
      [
        timingEntry("/time-entries/1", "2027-05-01T07:00:00.000Z"),
        timingEntry("/time-entries/2", "2027-05-13T07:00:00.000Z"),
      ],
      new Set(["/time-entries/2"]),
    );
    expect(plan.adopt).toEqual([
      { id: "h-2027-05-01", dateKey: "2027-05-01", self: "/time-entries/1" },
    ]);
    expect(plan.create.map((c) => c.dateKey)).toEqual(["2027-05-13"]);
  });

  it("ordnet nach Berliner Tag zu und ignoriert laufende Timer", () => {
    const plan = planHolidayPush(
      [holiday("2027-12-25"), holiday("2027-12-26")],
      [
        // 23:30 UTC am 24.12. ist in Berlin schon der 25.12.
        timingEntry("/time-entries/1", "2027-12-24T23:30:00.000Z"),
        timingEntry("/time-entries/2", "2027-12-26T08:00:00.000Z", {
          is_running: true,
        }),
      ],
      new Set(),
    );
    expect(plan.adopt.map((a) => a.dateKey)).toEqual(["2027-12-25"]);
    expect(plan.create.map((c) => c.dateKey)).toEqual(["2027-12-26"]);
  });
});

describe("Feiertagsprojekt", () => {
  it("erkennt Projekte, die der Sync als Feiertag einordnet", () => {
    expect(isHolidayProjectPath("Work ▸ INNOQ ▸ Feiertag")).toBe(true);
    expect(isHolidayProjectPath("Work ▸ INNOQ ▸ Feiertage")).toBe(true);
    expect(isHolidayProjectPath("Work ▸ INNOQ ▸ Intern")).toBe(false);
    // Urlaub gewinnt in der Typerkennung
    expect(isHolidayProjectPath("Work ▸ Urlaub & Feiertag")).toBe(false);
  });

  it("schlägt das erste passende Projekt vor", () => {
    const projects = [
      { id: "/projects/1", path: "Work ▸ INNOQ ▸ Urlaub" },
      { id: "/projects/2", path: "Work ▸ INNOQ ▸ Feiertag" },
    ];
    expect(suggestHolidayProject(projects)?.id).toBe("/projects/2");
    expect(suggestHolidayProject(projects.slice(0, 1))).toBeNull();
  });
});
