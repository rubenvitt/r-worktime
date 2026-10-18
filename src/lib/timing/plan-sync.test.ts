import type { EntrySource } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { SyncEntryData } from "./mapping";
import { type ExistingEntry, planSync } from "./plan-sync";

const WINDOW = { from: "2026-03-01", to: "2026-03-31" };

function incoming(id: string, dateKey = "2026-03-10"): SyncEntryData {
  return {
    externalId: `/time-entries/${id}`,
    dateKey,
    startTime: new Date(`${dateKey}T08:00:00.000Z`),
    endTime: new Date(`${dateKey}T09:00:00.000Z`),
    duration: 1,
    type: "WORK",
    description: "Alpha | 101: Backend",
    title: "Alpha | 101: Backend",
    notes: null,
    projectPath: "Work ▸ Firma ▸ Kunde A",
    billingStatus: null,
  };
}

function existing(
  id: string,
  source: EntrySource,
  overrides: Partial<ExistingEntry> = {},
): ExistingEntry {
  const base = incoming(id, overrides.dateKey);
  return {
    id: `db-${id}`,
    source,
    ...base,
    externalId: base.externalId,
    ...overrides,
  };
}

function expectDisjoint(plan: ReturnType<typeof planSync>) {
  const updateIds = plan.update.map((u) => u.id);
  const all = [...updateIds, ...plan.delete, ...plan.replaceFileImports];
  expect(new Set(all).size).toBe(all.length);
}

describe("planSync", () => {
  it("legt neue Einträge an", () => {
    const plan = planSync([], [incoming("1"), incoming("2")], WINDOW);
    expect(plan.create.map((e) => e.externalId)).toEqual([
      "/time-entries/1",
      "/time-entries/2",
    ]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
  });

  it("lässt unveränderte Einträge in Ruhe und aktualisiert geänderte", () => {
    const changed = { ...incoming("2"), notes: "neu" };
    const plan = planSync(
      [existing("1", "TIMING_SYNC"), existing("2", "TIMING_SYNC")],
      [incoming("1"), changed],
      WINDOW,
    );
    expect(plan.unchanged).toBe(1);
    expect(plan.update).toEqual([{ id: "db-2", data: changed }]);
    expect(plan.create).toEqual([]);
    expect(plan.delete).toEqual([]);
  });

  it("löscht TIMING_SYNC-Einträge im Fenster, die Timing nicht mehr liefert", () => {
    const plan = planSync(
      [existing("1", "TIMING_SYNC"), existing("gone", "TIMING_SYNC")],
      [incoming("1")],
      WINDOW,
    );
    expect(plan.delete).toEqual(["db-gone"]);
  });

  it("löscht nichts außerhalb des Fensters", () => {
    const plan = planSync(
      [existing("old", "TIMING_SYNC", { dateKey: "2026-02-28" })],
      [],
      WINDOW,
    );
    expect(plan.delete).toEqual([]);
  });

  it("übernimmt einen ins Fenster verschobenen Eintrag per Update statt neu", () => {
    const moved = incoming("7", "2026-03-05");
    const plan = planSync(
      [existing("7", "TIMING_SYNC", { dateKey: "2026-02-20" })],
      [moved],
      WINDOW,
    );
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([{ id: "db-7", data: moved }]);
  });

  it("ersetzt Datei-Importe an Tagen mit Sync-Daten, andere Tage bleiben", () => {
    const plan = planSync(
      [
        existing("f1", "FILE_IMPORT", {
          externalId: null,
          dateKey: "2026-03-10",
        }),
        existing("f2", "FILE_IMPORT", {
          externalId: null,
          dateKey: "2026-03-11",
        }),
      ],
      [incoming("1", "2026-03-10")],
      WINDOW,
    );
    expect(plan.replaceFileImports).toEqual(["db-f1"]);
    expect(plan.create).toHaveLength(1);
  });

  it("wandelt Datei-Importe mit gleicher ID in Sync-Einträge um", () => {
    const plan = planSync(
      [existing("1", "FILE_IMPORT")],
      [incoming("1")],
      WINDOW,
    );
    expect(plan.update.map((u) => u.id)).toEqual(["db-1"]);
    expect(plan.replaceFileImports).toEqual([]);
    expect(plan.create).toEqual([]);
    expectDisjoint(plan);
  });

  it("fasst manuelle, Feiertags-, Bulk-Fill- und Saldo-Einträge nie an", () => {
    const protectedEntries: ExistingEntry[] = (
      ["MANUAL", "HOLIDAY", "BULK_FILL", "ADJUSTMENT"] as EntrySource[]
    ).map((source) =>
      existing(`p-${source}`, source, {
        externalId: null,
        dateKey: "2026-03-10",
      }),
    );
    const plan = planSync(
      protectedEntries,
      [incoming("1", "2026-03-10")],
      WINDOW,
    );
    expect(plan.delete).toEqual([]);
    expect(plan.replaceFileImports).toEqual([]);
    expect(plan.update).toEqual([]);
  });

  it("meldet einen Konflikt, wenn die ID an einem geschützten Eintrag hängt", () => {
    const plan = planSync([existing("1", "MANUAL")], [incoming("1")], WINDOW);
    expect(plan.conflicts).toEqual(["/time-entries/1"]);
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
  });

  it("lässt verknüpfte TIMEWARP-Einträge in Ruhe: kein Update, kein Konflikt, kein Duplikat", () => {
    const timewarp = existing("tw", "TIMEWARP", {
      type: "VACATION",
      description: "Urlaub - Aus Timewarp",
      notes: "Aus Timewarp",
    });
    const plan = planSync([timewarp], [incoming("tw")], WINDOW);
    expect(plan.linked).toEqual(["/time-entries/tw"]);
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.delete).toEqual([]);
  });

  it("verknüpft Feiertage mit ihrem Timing-Eintrag statt Konflikt oder Duplikat", () => {
    const holiday = existing("ft", "HOLIDAY", {
      type: "HOLIDAY",
      description: "Tag der Arbeit",
    });
    const plan = planSync(
      [holiday],
      [{ ...incoming("ft"), projectPath: "Work ▸ INNOQ ▸ Feiertag" }],
      WINDOW,
    );
    expect(plan.linked).toEqual(["/time-entries/ft"]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
  });

  it("löscht TIMEWARP-Einträge im Fenster nicht, wenn Timing sie nicht mehr liefert", () => {
    const plan = planSync(
      [existing("tw", "TIMEWARP"), existing("gone", "TIMING_SYNC")],
      [],
      WINDOW,
    );
    expect(plan.delete).toEqual(["db-gone"]);
    expect(plan.linked).toEqual([]);
  });

  it("ersetzt Datei-Importe am Tag eines verknüpften TIMEWARP-Eintrags", () => {
    const plan = planSync(
      [
        existing("tw", "TIMEWARP"),
        existing("file", "FILE_IMPORT", { externalId: null }),
      ],
      [incoming("tw")],
      WINDOW,
    );
    expect(plan.replaceFileImports).toEqual(["db-file"]);
  });

  it("dedupliziert doppelt gelieferte IDs (der letzte gewinnt)", () => {
    const later = { ...incoming("1"), notes: "später" };
    const plan = planSync([], [incoming("1"), later], WINDOW);
    expect(plan.create).toEqual([later]);
  });

  it("vergleicht Zeitpunkte und Dauer nach Wert", () => {
    const entry = existing("1", "TIMING_SYNC", {
      startTime: new Date("2026-03-10T08:00:00.000Z"),
      duration: 1,
    });
    const plan = planSync([entry], [incoming("1")], WINDOW);
    expect(plan.unchanged).toBe(1);

    const shifted = {
      ...incoming("1"),
      endTime: new Date("2026-03-10T09:30:00.000Z"),
      duration: 1.5,
    };
    expect(planSync([entry], [shifted], WINDOW).update).toHaveLength(1);
  });

  it("hält create, update und delete disjunkt", () => {
    const plan = planSync(
      [
        existing("1", "TIMING_SYNC"),
        existing("2", "TIMING_SYNC"),
        existing("3", "FILE_IMPORT"),
        existing("f", "FILE_IMPORT", { externalId: null }),
      ],
      [{ ...incoming("1"), notes: "x" }, incoming("3"), incoming("4")],
      WINDOW,
    );
    expect(plan.update.map((u) => u.id).sort()).toEqual(["db-1", "db-3"]);
    expect(plan.delete).toEqual(["db-2"]);
    expect(plan.replaceFileImports).toEqual(["db-f"]);
    expect(plan.create.map((e) => e.externalId)).toEqual(["/time-entries/4"]);
    expectDisjoint(plan);
  });
});
