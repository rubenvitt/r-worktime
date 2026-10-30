import { describe, expect, it } from "vitest";
import {
  isOwnSickTimingEntry,
  isSickProjectPath,
  planSickFill,
  SICK_TIMING_NOTE,
  suggestSickProject,
} from "./sick";

describe("planSickFill", () => {
  it("füllt einen leeren Tag ab 08:00 Berliner Zeit auf das Soll", () => {
    expect(planSickFill("2026-10-28", [], 8)).toEqual({
      startTime: new Date("2026-10-28T07:00:00.000Z"),
      endTime: new Date("2026-10-28T15:00:00.000Z"),
      hours: 8,
    });
  });

  it("nimmt im Sommer die Sommerzeit", () => {
    expect(planSickFill("2026-07-01", [], 8)?.startTime).toEqual(
      new Date("2026-07-01T06:00:00.000Z"),
    );
  });

  it("füllt nur den Rest und beginnt nach dem letzten Eintrag", () => {
    const plan = planSickFill(
      "2026-10-28",
      [
        {
          startTime: new Date("2026-10-28T08:00:00.000Z"),
          endTime: new Date("2026-10-28T10:30:00.000Z"),
          duration: 2.5,
        },
        {
          startTime: new Date("2026-10-28T06:00:00.000Z"),
          endTime: new Date("2026-10-28T07:00:00.000Z"),
          duration: 1,
        },
      ],
      8,
    );
    expect(plan).toEqual({
      startTime: new Date("2026-10-28T10:30:00.000Z"),
      endTime: new Date("2026-10-28T15:00:00.000Z"),
      hours: 4.5,
    });
  });

  it("beginnt nicht vor 08:00, auch wenn der Eintrag früher endet", () => {
    const plan = planSickFill(
      "2026-10-28",
      [
        {
          startTime: new Date("2026-10-28T05:00:00.000Z"),
          endTime: new Date("2026-10-28T06:00:00.000Z"),
          duration: 1,
        },
      ],
      8,
    );
    expect(plan?.startTime).toEqual(new Date("2026-10-28T07:00:00.000Z"));
    expect(plan?.hours).toBe(7);
  });

  it("ergibt null, wenn das Soll schon erreicht ist", () => {
    const full = {
      startTime: new Date("2026-10-28T07:00:00.000Z"),
      endTime: new Date("2026-10-28T15:00:00.000Z"),
      duration: 8,
    };
    expect(planSickFill("2026-10-28", [full], 8)).toBeNull();
    expect(
      planSickFill("2026-10-28", [{ ...full, duration: 9 }], 8),
    ).toBeNull();
  });

  it("rundet Fließkomma-Reste", () => {
    const plan = planSickFill(
      "2026-10-28",
      [
        {
          startTime: new Date("2026-10-28T07:00:00.000Z"),
          endTime: new Date("2026-10-28T07:06:00.000Z"),
          duration: 0.1,
        },
        {
          startTime: new Date("2026-10-28T07:06:00.000Z"),
          endTime: new Date("2026-10-28T07:18:00.000Z"),
          duration: 0.2,
        },
      ],
      7.8,
    );
    expect(plan?.hours).toBe(7.5);
  });
});

describe("Krank-Projekt", () => {
  it("erkennt Krank-Projekte am Pfad", () => {
    expect(isSickProjectPath("Work ▸ INNOQ ▸ Krank")).toBe(true);
    expect(isSickProjectPath("Work ▸ INNOQ ▸ Krankheit")).toBe(true);
    expect(isSickProjectPath("Work ▸ INNOQ ▸ Kunde")).toBe(false);
  });

  it("schlägt das erste passende Projekt vor", () => {
    const projects = [
      { id: "/projects/1", path: "Work ▸ Kunde" },
      { id: "/projects/2", path: "Work ▸ Krank" },
      { id: "/projects/3", path: "Work ▸ Sick" },
    ];
    expect(suggestSickProject(projects)?.id).toBe("/projects/2");
    expect(suggestSickProject(projects.slice(0, 1))).toBeNull();
  });
});

describe("isOwnSickTimingEntry", () => {
  const own = {
    source: "MANUAL",
    type: "SICK",
    notes: SICK_TIMING_NOTE,
    externalId: "/time-entries/1",
  };

  it("erkennt eigene Krank-Einträge", () => {
    expect(isOwnSickTimingEntry(own)).toBe(true);
  });

  it("lässt bearbeitete Sync-Einträge und fremde Notizen in Ruhe", () => {
    expect(isOwnSickTimingEntry({ ...own, notes: null })).toBe(false);
    expect(isOwnSickTimingEntry({ ...own, type: "WORK" })).toBe(false);
    expect(isOwnSickTimingEntry({ ...own, source: "TIMING_SYNC" })).toBe(false);
    expect(isOwnSickTimingEntry({ ...own, externalId: null })).toBe(false);
  });
});
