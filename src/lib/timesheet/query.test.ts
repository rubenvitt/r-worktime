import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import type { TimesheetSourceEntry } from "./entries";
import { buildTimesheetResponse } from "./query";

function entry(
  start: string,
  end: string,
  notes: string,
): TimesheetSourceEntry {
  return {
    id: start,
    startTime: new Date(start),
    endTime: new Date(end),
    type: "WORK",
    source: "TIMING_SYNC",
    title: "Alpha",
    notes,
    description: null,
    projectPath: "Work ▸ Kunde A",
    billingStatus: null,
  };
}

const query = {
  month: "2026-03",
  root: null,
  includeAbsences: false,
  rounding: 15 as const,
};

describe("buildTimesheetResponse – Reisetage", () => {
  const entries = [
    entry("2026-03-02T08:00:00Z", "2026-03-02T16:00:00Z", "Präsenztag"),
    entry("2026-03-03T08:00:00Z", "2026-03-03T16:00:00Z", "Remote"),
    entry("2026-03-04T08:00:00Z", "2026-03-04T16:00:00Z", "Remote"),
  ];

  it("ohne Festlegungen trägt der Payload den Vorschlag", () => {
    const response = buildTimesheetResponse(entries, query, []);
    expect(response.payload.map((p) => p.travelFee)).toEqual([
      true,
      false,
      false,
    ]);
    expect(response.days.map((d) => d.travelOverride)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("Festlegungen gewinnen; travelFee am Tag bleibt der Vorschlag", () => {
    const response = buildTimesheetResponse(entries, query, [], {
      "2026-03-02": false,
      "2026-03-03": true,
    });
    expect(response.payload.map((p) => p.travelFee)).toEqual([
      false,
      true,
      false,
    ]);
    expect(response.days.map((d) => [d.travelFee, d.travelOverride])).toEqual([
      [true, false],
      [false, true],
      [false, null],
    ]);
  });
});
