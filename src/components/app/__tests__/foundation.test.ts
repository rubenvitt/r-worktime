import { describe, expect, it } from "vitest";
import {
  closeRange,
  defaultCloseMonth,
  shiftMonth,
} from "@/components/app/month";
import { deriveSyncState } from "@/components/app/sync-state";
import { timesheetQueryString } from "@/components/app/timesheet-prefs";
import {
  activeNavKey,
  currentWeekHref,
  NAV_ITEMS,
  navItem,
} from "@/components/layout/nav-config";
import {
  formatDateLong,
  formatDateShort,
  formatDelta,
  formatDuration,
  formatHours,
  formatMonth,
  formatRelative,
  formatSeconds,
  formatTimeRange,
  formatTimestamp,
  MINUS,
} from "@/lib/format";
import { billingStatusLabel } from "@/lib/labels";
import type { PublicTimingStatus } from "@/lib/timing/settings";

// 09.10.2026, 10:00 Berlin (UTC+2)
const NOW = new Date("2026-10-09T08:00:00Z");

describe("format", () => {
  it("formatiert Dauern als H:MM", () => {
    expect(formatDuration(475)).toBe("7:55");
    expect(formatDuration(23910)).toBe("398:30");
    expect(formatDuration(-195)).toBe(`${MINUS}3:15`);
    expect(formatHours(7.5)).toBe("7:30");
  });

  it("formatiert Differenzen mit Vorzeichen", () => {
    expect(formatDelta(30)).toBe("+0:30");
    expect(formatDelta(-195)).toBe("−3:15");
    expect(formatDelta(0)).toBe("±0:00");
    expect(formatDelta(-0.4)).toBe("±0:00");
    expect(formatDelta(null)).toBe("—");
    expect(formatDelta(undefined)).toBe("—");
  });

  it("formatiert Datumsangaben in Berlin", () => {
    expect(formatDateShort("2026-10-01")).toBe("Do 01.10.");
    expect(formatDateShort("2026-10-07T00:00:00.000Z")).toBe("Mi 07.10.");
    expect(formatDateLong("2026-10-01")).toBe("Donnerstag, 1. Oktober 2026");
    expect(formatMonth("2026-10")).toBe("Oktober 2026");
    expect(formatTimestamp("2026-10-09T06:00:00Z")).toBe("09.10.2026, 08:00");
    expect(
      formatTimeRange("2026-09-29T06:50:00Z", "2026-09-29T07:05:00Z"),
    ).toBe("08:50–09:05");
    expect(formatSeconds(1800)).toBe("1,8 s");
  });

  it("formatiert relative Zeiten", () => {
    expect(formatRelative("2026-10-09T07:55:00Z", NOW)).toBe("vor 5 Min.");
    expect(formatRelative("2026-10-09T06:00:00Z", NOW)).toBe("vor 2 Std.");
    expect(formatRelative("2026-10-08T15:40:00Z", NOW)).toBe("gestern, 17:40");
    expect(formatRelative("2026-10-05T06:00:00Z", NOW)).toBe("05.10., 08:00");
  });
});

describe("labels", () => {
  it("übersetzt den Abrechnungsstatus", () => {
    expect(billingStatusLabel("unbilled")).toBe("Offen");
    expect(billingStatusLabel("billable")).toBe("Offen");
    expect(billingStatusLabel("paid")).toBe("Bezahlt");
    expect(billingStatusLabel("Not Billable")).toBe("Nicht abrechenbar");
    expect(billingStatusLabel("Sonderfall")).toBe("Sonderfall");
    expect(billingStatusLabel(null)).toBe("—");
  });
});

describe("month", () => {
  it("verschiebt Monate über Jahresgrenzen", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("wählt bis zum 10. den Vormonat", () => {
    expect(defaultCloseMonth(NOW)).toBe("2026-09");
    expect(defaultCloseMonth(new Date("2026-10-11T08:00:00Z"))).toBe("2026-10");
  });

  it("begrenzt den Prüfbereich auf Erfassungsbeginn und gestern", () => {
    expect(closeRange("2026-10", "2026-08-03", NOW)).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-08",
    });
    expect(closeRange("2026-08", "2026-08-03", NOW)).toEqual({
      startDate: "2026-08-03",
      endDate: "2026-08-31",
    });
    expect(
      closeRange("2026-10", null, new Date("2026-10-01T08:00:00Z")),
    ).toBeNull();
    expect(closeRange("2026-11", null, NOW)).toBeNull();
    expect(closeRange("2026-07", "2026-08-03", NOW)).toBeNull();
  });
});

describe("timesheetQueryString", () => {
  it("baut die Parameter in fester Reihenfolge", () => {
    expect(
      timesheetQueryString("2026-10", {
        root: "Work ▸ Firma ▸ Kunde A",
        rounding: 15,
        includeAbsences: true,
      }),
    ).toBe(
      "month=2026-10&root=Work+%E2%96%B8+Firma+%E2%96%B8+Kunde+A&rounding=15&includeAbsences=1",
    );
    expect(
      timesheetQueryString(
        "2026-10",
        { root: null, rounding: 15, includeAbsences: false },
        false,
      ),
    ).toBe("month=2026-10");
  });
});

describe("deriveSyncState", () => {
  const base: PublicTimingStatus = {
    running: false,
    syncEnabled: true,
    hasToken: true,
    lastSyncAt: "2026-10-09T06:00:00Z",
    lastSyncStatus: "SUCCESS",
    lastSyncError: null,
    lastSyncStats: null,
    nextSyncAt: null,
  };

  it("leitet die Zustände in fester Reihenfolge ab", () => {
    expect(deriveSyncState(undefined, NOW)).toBe("not-connected");
    expect(deriveSyncState({ ...base, hasToken: false }, NOW)).toBe(
      "not-connected",
    );
    expect(deriveSyncState({ ...base, running: true }, NOW)).toBe("running");
    expect(deriveSyncState({ ...base, lastSyncStatus: "FAILED" }, NOW)).toBe(
      "failed",
    );
    expect(
      deriveSyncState({ ...base, lastSyncAt: null, lastSyncStatus: null }, NOW),
    ).toBe("never");
    expect(
      deriveSyncState({ ...base, lastSyncAt: "2026-10-07T06:00:00Z" }, NOW),
    ).toBe("stale");
    expect(deriveSyncState(base, NOW)).toBe("ok");
  });
});

describe("nav-config", () => {
  it("markiert genau einen Bereich", () => {
    expect(activeNavKey("/dashboard")).toBe("overview");
    expect(activeNavKey("/week/2026/41")).toBe("week");
    expect(activeNavKey("/statistics/weekly")).toBe("week");
    expect(activeNavKey("/settings/overtime")).toBe("settings");
    expect(activeNavKey("/upload")).toBe("settings");
    expect(activeNavKey("/timesheetx")).toBeNull();
    expect(activeNavKey("/reports")).toBe("reports");
    expect(activeNavKey("/reports/year")).toBe("reports");
    expect(activeNavKey("/reportsx")).toBeNull();
  });

  it("hat eindeutige Tastenkürzel", () => {
    const shortcuts = NAV_ITEMS.flatMap((item) =>
      item.shortcut ? [item.shortcut] : [],
    );
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(navItem("reports")).toMatchObject({
      href: "/reports",
      group: "Auswertung",
      shortcut: "g b",
    });
  });

  it("verlinkt die ISO-Woche", () => {
    expect(currentWeekHref(NOW)).toBe("/week/2026/41");
    expect(currentWeekHref(new Date("2027-01-01T10:00:00Z"))).toBe(
      "/week/2026/53",
    );
  });
});
