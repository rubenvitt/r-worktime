import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { keepMissingSyncFields, resolveRestoreSource } from "./backup-restore";

describe("resolveRestoreSource", () => {
  it("übernimmt eine gültige Quelle aus neuen Backups", () => {
    expect(resolveRestoreSource({ type: "WORK", source: "TIMING_SYNC" })).toBe(
      "TIMING_SYNC",
    );
  });

  it("wendet für Alt-Backups die Regeln der Migration an", () => {
    expect(
      resolveRestoreSource({
        type: "WORK",
        description: "Anfangs-Überstunden-Saldo: 12h",
      }),
    ).toBe("ADJUSTMENT");
    expect(resolveRestoreSource({ type: "HOLIDAY", description: null })).toBe(
      "HOLIDAY",
    );
    expect(resolveRestoreSource({ type: "WORK", description: "Alpha" })).toBe(
      "MANUAL",
    );
    expect(resolveRestoreSource({ type: "WORK", source: "UNKNOWN" })).toBe(
      "MANUAL",
    );
  });
});

describe("keepMissingSyncFields", () => {
  const existing = {
    source: "TIMING_SYNC",
    externalId: "/time-entries/1",
    title: "Alpha | 101: Backend",
    notes: "API-Design",
    projectPath: "Work ▸ Firma ▸ Kunde A",
    billingStatus: "Billable",
  };
  const fromBackup = {
    source: "MANUAL",
    externalId: null,
    title: null,
    notes: null,
    projectPath: null,
    billingStatus: null,
    duration: 2,
  };

  it("stuft vorhandene Sync-Einträge durch Alt-Backups nicht herab", () => {
    const legacyEntry = { type: "WORK", duration: "2" };
    expect(keepMissingSyncFields(fromBackup, legacyEntry, existing)).toEqual({
      ...existing,
      duration: 2,
    });
  });

  it("nimmt die Werte neuer Backups vollständig", () => {
    const newEntry = { ...fromBackup, type: "WORK" };
    expect(keepMissingSyncFields(fromBackup, newEntry, existing)).toEqual(
      fromBackup,
    );
  });
});
