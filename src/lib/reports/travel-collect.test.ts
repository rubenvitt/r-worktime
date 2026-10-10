import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import type { TimesheetSourceEntry } from "@/lib/timesheet/entries";
import { collectTravelDays } from "./travel-collect";

let counter = 0;
function entry(overrides: Partial<TimesheetSourceEntry>): TimesheetSourceEntry {
  counter += 1;
  return {
    id: `e${counter}`,
    startTime: new Date("2026-03-02T08:00:00Z"),
    endTime: new Date("2026-03-02T10:00:00Z"),
    type: "WORK",
    source: "TIMING_SYNC",
    title: "Alpha | 101: Backend",
    notes: "API-Design",
    description: null,
    projectPath: "Work ▸ Kunde A",
    billingStatus: "billable",
    ...overrides,
  };
}

describe("collectTravelDays", () => {
  it("gruppiert nach Berliner Tag des Starts und erkennt Vorschläge", () => {
    const days = collectTravelDays(
      [
        // 23:30 Berlin am 01.03. → gehört zum 01.03., nicht zum 02.03.
        entry({
          startTime: new Date("2026-03-01T22:30:00Z"),
          endTime: new Date("2026-03-01T23:00:00Z"),
          title: "Nachtschicht",
          notes: "",
        }),
        entry({ title: "Kunde A (Präsenztag)", notes: "" }),
        entry({
          startTime: new Date("2026-03-02T11:00:00Z"),
          endTime: new Date("2026-03-02T12:00:00Z"),
          projectPath: "Work ▸ Kunde B",
        }),
      ],
      2026,
    );
    expect(days.map((d) => d.date)).toEqual(["2026-03-01", "2026-03-02"]);
    expect(days[0].suggested).toBe(false);
    expect(days[1]).toEqual({
      date: "2026-03-02",
      minutes: 180,
      activities: [
        { title: "Kunde A (Präsenztag)", minutes: 120 },
        { title: "Alpha | 101: Backend", minutes: 60 },
      ],
      projects: ["Work ▸ Kunde A", "Work ▸ Kunde B"],
      suggested: true,
    });
  });

  it("zählt nur Arbeit: keine Abwesenheiten, keinen Saldo, kein anderes Jahr", () => {
    const days = collectTravelDays(
      [
        entry({ type: "VACATION", notes: "Dienstreise" }),
        entry({ source: "ADJUSTMENT", notes: "Dienstreise" }),
        entry({
          source: "MANUAL",
          description: "Anfangs-Überstunden-Saldo: 12h",
          notes: "Dienstreise",
        }),
        // 31.12.2025 23:30 Berlin
        entry({
          startTime: new Date("2025-12-31T22:30:00Z"),
          endTime: new Date("2025-12-31T22:45:00Z"),
          notes: "Dienstreise",
        }),
        entry({ type: "OVERTIME", notes: "Vor Ort" }),
      ],
      2026,
    );
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({
      date: "2026-03-02",
      minutes: 120,
      suggested: true,
    });
  });

  it("nimmt bei manuellen Einträgen die duration-Spalte wie der Stundenzettel", () => {
    const days = collectTravelDays(
      [
        entry({
          source: "BULK_FILL",
          startTime: new Date("2026-03-03T08:00:00Z"),
          endTime: new Date("2026-03-03T16:00:00Z"),
          duration: 7.5,
          projectPath: null,
        }),
      ],
      2026,
    );
    expect(days[0]).toMatchObject({ minutes: 450, projects: [] });
  });
});
