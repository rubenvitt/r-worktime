import { describe, expect, it } from "vitest";
import {
  isSchedulerEnabled,
  isSyncDue,
  nextSyncDue,
  normalizeProjectRoots,
  timingSettingsUpdateSchema,
} from "./settings";

const now = new Date("2026-10-09T12:00:00.000Z");

describe("isSyncDue", () => {
  const base = {
    syncEnabled: true,
    apiTokenEnc: "v1:x:y:z",
    syncIntervalMinutes: 60,
    lastSyncAt: null as Date | null,
  };

  it("ist fällig ohne bisherigen Sync", () => {
    expect(isSyncDue(base, now)).toBe(true);
  });

  it("wartet das Intervall ab", () => {
    expect(
      isSyncDue(
        { ...base, lastSyncAt: new Date("2026-10-09T11:30:00.000Z") },
        now,
      ),
    ).toBe(false);
    expect(
      isSyncDue(
        { ...base, lastSyncAt: new Date("2026-10-09T11:00:00.000Z") },
        now,
      ),
    ).toBe(true);
  });

  it("ist nie fällig ohne Token oder bei deaktiviertem Sync", () => {
    expect(isSyncDue({ ...base, apiTokenEnc: null }, now)).toBe(false);
    expect(isSyncDue({ ...base, syncEnabled: false }, now)).toBe(false);
    expect(nextSyncDue({ ...base, syncEnabled: false }, now)).toBeNull();
  });
});

describe("isSchedulerEnabled", () => {
  it("ist standardmäßig an und lässt sich mit off abschalten", () => {
    expect(isSchedulerEnabled({})).toBe(true);
    expect(isSchedulerEnabled({ TIMING_SYNC_SCHEDULER: "on" })).toBe(true);
    expect(isSchedulerEnabled({ TIMING_SYNC_SCHEDULER: "off" })).toBe(false);
    expect(isSchedulerEnabled({ TIMING_SYNC_SCHEDULER: " OFF " })).toBe(false);
  });
});

describe("normalizeProjectRoots", () => {
  it("vereinheitlicht Trenner und entfernt Leere und Duplikate", () => {
    expect(
      normalizeProjectRoots([
        "Work",
        " Work ",
        "Work▸Kunde A",
        "",
        "Work ▸ Kunde A",
      ]),
    ).toEqual(["Work", "Work ▸ Kunde A"]);
  });
});

describe("timingSettingsUpdateSchema", () => {
  it("lehnt leere Wurzel-Listen ab", () => {
    expect(
      timingSettingsUpdateSchema.safeParse({ projectRoots: [" "] }).success,
    ).toBe(false);
  });

  it("prüft Intervall- und Fenstergrenzen", () => {
    expect(
      timingSettingsUpdateSchema.safeParse({ syncIntervalMinutes: 1 }).success,
    ).toBe(false);
    expect(
      timingSettingsUpdateSchema.safeParse({ syncWindowDays: 0 }).success,
    ).toBe(false);
    expect(
      timingSettingsUpdateSchema.safeParse({
        syncIntervalMinutes: 60,
        syncWindowDays: 35,
        apiToken: null,
      }).success,
    ).toBe(true);
  });
});
