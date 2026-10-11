import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CalendarSettings } from "@/components/calendar/api-types";
import type { AbsenceBlock } from "@/lib/absences/blocks";
import { formatBlockDays, formatBlockPeriod } from "./absence-blocks-format";
import { AbsenceBlocksList } from "./absence-blocks-list";
import { CalendarSyncHintText } from "./calendar-sync-hint";

// Rauchtest ohne Browser: Liste und Kalender-Hinweis rendern mit Beispieldaten.

function block(overrides: Partial<AbsenceBlock> = {}): AbsenceBlock {
  return {
    id: "a1",
    source: "TIMEWARP",
    kind: "VACATION",
    from: "2026-10-12",
    to: "2026-10-16",
    halfDay: false,
    status: "ACTIVE",
    state: "planned",
    days: 5,
    deletable: false,
    ...overrides,
  };
}

describe("formatBlockPeriod", () => {
  it("kürzt das Jahr am Beginn, wenn beide Tage im selben Jahr liegen", () => {
    expect(formatBlockPeriod("2026-10-12", "2026-10-16")).toBe(
      "Mo 12.10. – Fr 16.10.2026",
    );
    expect(formatBlockPeriod("2026-10-12", "2026-10-12")).toBe("Mo 12.10.2026");
    expect(formatBlockPeriod("2026-12-28", "2027-01-04")).toBe(
      "Mo 28.12.2026 – Mo 04.01.2027",
    );
  });

  it("nennt halbe Tage als solche", () => {
    expect(formatBlockDays(block({ halfDay: true, days: 0.5 }))).toBe(
      "halber Tag",
    );
    expect(formatBlockDays(block({ days: 2.5 }))).toBe("2,5 Tage");
  });
});

describe("AbsenceBlocksList", () => {
  const html = renderToStaticMarkup(
    createElement(AbsenceBlocksList, {
      blocks: [
        block(),
        block({
          id: "m1",
          source: "MANUAL",
          from: "2026-09-01",
          to: "2026-09-01",
          halfDay: true,
          days: 0.5,
          state: "taken",
          deletable: true,
        }),
        block({
          id: "c1",
          kind: "SPECIAL_LEAVE",
          state: "cancelled",
          status: "CANCELLED",
        }),
        block({
          id: null,
          source: "TIMING",
          from: "2026-03-02",
          to: "2026-03-03",
          days: 2,
          state: "taken",
        }),
      ],
      onRequestDelete: () => {},
    }),
  );

  it("zeigt Zeitraum, Art, Tage, Status und Herkunft", () => {
    expect(html).toContain("Mo 12.10. – Fr 16.10.2026");
    expect(html).toContain("Urlaub");
    expect(html).toContain("5 Tage");
    expect(html).toContain("geplant");
    expect(html).toContain("Timewarp");
    expect(html).toContain("manuell");
    expect(html).toContain("Timing");
    expect(html).toContain("halber Tag");
  });

  it("streicht stornierte Blöcke durch", () => {
    expect(html).toContain("storniert");
    expect(html).toMatch(/line-through[^>]*>Sonderurlaub/);
  });

  it("bietet Löschen nur für löschbare Blöcke an", () => {
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain(
      'aria-label="Urlaub Di 01.09.2026 (halber Tag) löschen"',
    );
  });
});

describe("CalendarSyncHintText", () => {
  const settings: CalendarSettings = {
    configured: true,
    feedHost: "timewarp.innoq.io",
    syncEnabled: true,
    writeToTiming: true,
    timingProjectId: null,
    timingConnected: false,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    lastSyncStats: null,
  };

  it("lädt ohne Feed zum Einrichten ein", () => {
    const html = renderToStaticMarkup(
      createElement(CalendarSyncHintText, {
        settings: { ...settings, configured: false },
      }),
    );
    expect(html).toContain("Kalender einrichten");
    expect(html).toContain('href="/settings/calendar"');
  });

  it("nennt den letzten Abgleich oder den Fehler", () => {
    const synced = renderToStaticMarkup(
      createElement(CalendarSyncHintText, {
        settings: { ...settings, lastSyncAt: "2026-10-11T08:00:00Z" },
      }),
    );
    expect(synced).toContain("Kalender zuletzt abgeglichen");
    expect(synced).toContain('dateTime="2026-10-11T08:00:00Z"');

    const failed = renderToStaticMarkup(
      createElement(CalendarSyncHintText, {
        settings: { ...settings, lastSyncStatus: "error" },
      }),
    );
    expect(failed).toContain("fehlgeschlagen");
  });
});
