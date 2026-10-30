import { describe, expect, it } from "vitest";
import type { TimingApiTimeEntry } from "./client";
import {
  isSickProjectPath,
  type PendingSickEntry,
  planSickFill,
  planSickPush,
  startedSickEntries,
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

function pending(id: string, start: string, end: string): PendingSickEntry {
  return {
    id,
    startTime: new Date(start),
    endTime: new Date(end),
    title: "Krankheit",
    notes: null,
  };
}

function timingEntry(
  self: string,
  start: string,
  end: string,
  overrides: Partial<TimingApiTimeEntry> = {},
): TimingApiTimeEntry {
  return {
    self,
    start_date: start,
    end_date: end,
    duration: null,
    project: null,
    title: "Krankheit",
    notes: null,
    is_running: false,
    ...overrides,
  };
}

describe("startedSickEntries", () => {
  it("lässt Einträge weg, die noch nicht begonnen haben", () => {
    const now = new Date("2026-10-30T08:00:00.000Z");
    const entries = [
      pending("a", "2026-10-30T07:00:00.000Z", "2026-10-30T15:00:00.000Z"),
      pending("b", "2026-11-02T07:00:00.000Z", "2026-11-02T15:00:00.000Z"),
    ];
    expect(startedSickEntries(entries, now).map((e) => e.id)).toEqual(["a"]);
  });
});

describe("planSickPush", () => {
  const a = pending(
    "a",
    "2026-10-28T07:00:00.000Z",
    "2026-10-28T15:00:00.000Z",
  );
  const b = pending(
    "b",
    "2026-10-29T07:00:00.000Z",
    "2026-10-29T15:00:00.000Z",
  );

  it("übernimmt einen Timing-Eintrag mit genau gleichen Zeiten, sonst neu", () => {
    const plan = planSickPush(
      [a, b],
      [
        timingEntry(
          "/time-entries/1",
          "2026-10-28T08:00:00+01:00",
          "2026-10-28T16:00:00+01:00",
        ),
        // anderes Ende: kein Treffer
        timingEntry(
          "/time-entries/2",
          "2026-10-29T08:00:00+01:00",
          "2026-10-29T12:00:00+01:00",
        ),
      ],
      new Set(),
    );
    expect(plan.adopt).toEqual([{ id: "a", self: "/time-entries/1" }]);
    expect(plan.create.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("nimmt keine schon verknüpften oder laufenden Einträge", () => {
    const plan = planSickPush(
      [a],
      [
        timingEntry(
          "/time-entries/1",
          "2026-10-28T08:00:00+01:00",
          "2026-10-28T16:00:00+01:00",
        ),
        timingEntry(
          "/time-entries/3",
          "2026-10-28T08:00:00+01:00",
          "2026-10-28T16:00:00+01:00",
          { is_running: true },
        ),
      ],
      new Set(["/time-entries/1"]),
    );
    expect(plan.adopt).toEqual([]);
    expect(plan.create).toEqual([a]);
  });
});
