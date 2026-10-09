import type { EntrySource } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  type EditableEntrySnapshot,
  keepExactTimes,
  type ManualEdit,
  manualEditOverrides,
} from "./manual-edit";

function existing(
  overrides: Partial<EditableEntrySnapshot> = {},
): EditableEntrySnapshot {
  return {
    source: "TIMING_SYNC",
    externalId: "/time-entries/1",
    date: new Date("2026-09-01T00:00:00.000Z"),
    startTime: new Date("2026-09-01T06:00:00.000Z"),
    endTime: new Date("2026-09-01T07:30:00.000Z"),
    duration: 1.5,
    type: "WORK",
    description: "Alpha | 101: Backend - API-Design",
    ...overrides,
  };
}

function edit(overrides: Partial<ManualEdit> = {}): ManualEdit {
  return {
    date: new Date("2026-09-01T00:00:00.000Z"),
    startTime: new Date("2026-09-01T06:00:00.000Z"),
    endTime: new Date("2026-09-01T07:30:00.000Z"),
    duration: 1.5,
    type: "WORK",
    description: "Alpha | 101: Backend - API-Design",
    ...overrides,
  };
}

describe("manualEditOverrides", () => {
  it("ändert nichts, wenn nur ohne Änderung gespeichert wird", () => {
    expect(manualEditOverrides(existing(), edit())).toEqual({});
    // Decimal aus Prisma kommt als Objekt mit toString()
    expect(
      manualEditOverrides(
        existing({ duration: { toString: () => "1.50" } }),
        edit(),
      ),
    ).toEqual({});
  });

  it("macht korrigierte Sync- und Import-Einträge mit ID zu MANUAL", () => {
    const later = edit({
      endTime: new Date("2026-09-01T08:00:00.000Z"),
      duration: 2,
    });
    for (const source of ["TIMING_SYNC", "FILE_IMPORT"] as EntrySource[]) {
      expect(manualEditOverrides(existing({ source }), later)).toEqual({
        source: "MANUAL",
      });
    }
  });

  it("lässt Alt-Importe ohne ID als FILE_IMPORT (sonst Duplikat beim Sync)", () => {
    const later = edit({ duration: 2 });
    expect(
      manualEditOverrides(
        existing({ source: "FILE_IMPORT", externalId: null }),
        later,
      ),
    ).toEqual({});
  });

  it("fasst die Quelle anderer Einträge nicht an", () => {
    for (const source of ["MANUAL", "BULK_FILL", "HOLIDAY"] as EntrySource[]) {
      expect(
        manualEditOverrides(
          existing({ source, externalId: null }),
          edit({ duration: 2 }),
        ),
      ).toEqual({});
    }
  });

  it("leert title und notes, wenn sich die Beschreibung ändert", () => {
    expect(
      manualEditOverrides(
        existing(),
        edit({ description: "Beta | 202: Review" }),
      ),
    ).toEqual({ source: "MANUAL", title: null, notes: null });
  });
});

describe("keepExactTimes", () => {
  // Echte Timing-Daten haben Sekunden, der Dialog sendet nur HH:mm
  const exact = existing({
    startTime: new Date("2026-09-01T06:00:27.000Z"),
    endTime: new Date("2026-09-01T07:30:44.000Z"),
    duration: { toString: () => "1.51" },
  });

  it("macht Speichern ohne Änderung zum echten No-op", () => {
    const sent = edit(); // 06:00–07:30, 1,5 h
    const merged = keepExactTimes(exact, sent);
    expect(merged.startTime).toEqual(exact.startTime);
    expect(merged.endTime).toEqual(exact.endTime);
    expect(merged.duration).toBe(1.51);
    expect(manualEditOverrides(exact, merged)).toEqual({});
  });

  it("behält die exakten Zeiten, wenn nur die Beschreibung geändert wird", () => {
    const merged = keepExactTimes(exact, edit({ description: "Neu" }));
    expect(merged.startTime).toEqual(exact.startTime);
    expect(manualEditOverrides(exact, merged)).toEqual({
      source: "MANUAL",
      title: null,
      notes: null,
    });
  });

  it("übernimmt geänderte Zeiten unverändert", () => {
    const sent = edit({
      endTime: new Date("2026-09-01T08:00:00.000Z"),
      duration: 2,
    });
    expect(keepExactTimes(exact, sent)).toEqual(sent);
  });
});
