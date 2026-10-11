import { beforeAll, describe, expect, it } from "vitest";
import { encryptSecret } from "@/lib/crypto";
import {
  calendarSettingsUpdateSchema,
  isCalendarSyncDue,
  toPublicCalendarSettings,
} from "./settings";

beforeAll(() => {
  process.env.TIMING_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString(
    "base64",
  );
});

const NOW = new Date("2026-10-11T10:00:00.000Z");

describe("isCalendarSyncDue", () => {
  const base = { syncEnabled: true, feedUrlEnc: "enc", lastSyncAt: null };

  it("ist fällig ohne bisherigen Lauf und nach einer Stunde", () => {
    expect(isCalendarSyncDue(base, NOW)).toBe(true);
    expect(
      isCalendarSyncDue(
        { ...base, lastSyncAt: new Date("2026-10-11T09:00:00.000Z") },
        NOW,
      ),
    ).toBe(true);
    expect(
      isCalendarSyncDue(
        { ...base, lastSyncAt: new Date("2026-10-11T09:30:00.000Z") },
        NOW,
      ),
    ).toBe(false);
  });

  it("ist nie fällig, wenn aus oder ohne Feed", () => {
    expect(isCalendarSyncDue({ ...base, syncEnabled: false }, NOW)).toBe(false);
    expect(isCalendarSyncDue({ ...base, feedUrlEnc: null }, NOW)).toBe(false);
  });
});

describe("toPublicCalendarSettings", () => {
  it("zeigt nur den Host, nie die URL", () => {
    const settings = toPublicCalendarSettings(
      {
        id: "c",
        userId: "u",
        feedUrlEnc: encryptSecret(
          "https://timewarp.innoq.io/export/geheim/calendar.ics",
        ),
        syncEnabled: true,
        writeToTiming: true,
        timingProjectId: "/projects/5",
        lastSyncAt: NOW,
        lastSyncStatus: "success",
        lastSyncError: null,
        lastSyncStats: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
      true,
    );
    expect(settings).toEqual({
      configured: true,
      feedHost: "timewarp.innoq.io",
      syncEnabled: true,
      writeToTiming: true,
      timingProjectId: "/projects/5",
      timingConnected: true,
      lastSyncAt: NOW.toISOString(),
      lastSyncStatus: "success",
      lastSyncError: null,
      lastSyncStats: null,
    });
    expect(JSON.stringify(settings)).not.toContain("geheim");
  });

  it("liefert Standardwerte ohne Integration", () => {
    expect(toPublicCalendarSettings(null, false)).toMatchObject({
      configured: false,
      feedHost: null,
      syncEnabled: false,
      writeToTiming: true,
      timingProjectId: null,
      timingConnected: false,
    });
  });
});

describe("calendarSettingsUpdateSchema", () => {
  it("prüft die Projekt-Referenz und lehnt unbekannte Felder ab", () => {
    expect(
      calendarSettingsUpdateSchema.safeParse({ timingProjectId: "/projects/1" })
        .success,
    ).toBe(true);
    expect(
      calendarSettingsUpdateSchema.safeParse({ timingProjectId: null }).success,
    ).toBe(true);
    expect(
      calendarSettingsUpdateSchema.safeParse({ timingProjectId: "Urlaub" })
        .success,
    ).toBe(false);
    expect(
      calendarSettingsUpdateSchema.safeParse({ feedUrlEnc: "x" }).success,
    ).toBe(false);
  });
});
