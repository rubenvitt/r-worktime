import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeedTestResult } from "./calendar-feed-card";
import { CalendarSyncLogList } from "./calendar-sync-log";

// Rauchtest ohne Browser: Protokoll und Testergebnis rendern mit Beispieldaten.

describe("CalendarSyncLogList", () => {
  it("gruppiert Aktionen je Lauf, aufklappbar und deutsch beschriftet", () => {
    const html = renderToStaticMarkup(
      createElement(CalendarSyncLogList, {
        logs: [
          {
            id: "l2",
            startedAt: "2026-10-11T08:00:00Z",
            finishedAt: "2026-10-11T08:00:02Z",
            status: "success",
            error: null,
            actions: [
              {
                date: "2026-10-13",
                kind: "VACATION",
                action: "timingCreated",
                detail: "Work ▸ INNOQ ▸ Urlaub",
              },
              {
                date: "2026-10-12",
                kind: "VACATION",
                action: "created",
                detail: null,
              },
              {
                date: null,
                kind: "HOMEOFFICE",
                action: "skippedUnknownType",
                detail: null,
              },
            ],
          },
          {
            id: "l1",
            startedAt: "2026-10-11T07:00:00Z",
            finishedAt: "2026-10-11T07:00:01Z",
            status: "error",
            error: "Feed nicht erreichbar",
            actions: [],
          },
        ],
      }),
    );

    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html).toContain("Erfolgreich");
    expect(html).toContain("Fehlgeschlagen");
    expect(html).toContain(
      "1 angelegt · 1 in Timing eingetragen · 1 übersprungen (unbekannter Typ)",
    );
    expect(html).toContain("In Timing eingetragen");
    expect(html).toContain("Mo 12.10.2026");
    expect(html).toContain("HOMEOFFICE");
    expect(html).toContain("Feed nicht erreichbar");
    // Chronologisch: 12.10. vor 13.10.
    expect(html.indexOf("Mo 12.10.2026")).toBeLessThan(
      html.indexOf("Di 13.10.2026"),
    );
  });

  it("zeigt ohne Läufe einen Leerzustand", () => {
    const html = renderToStaticMarkup(
      createElement(CalendarSyncLogList, { logs: [] }),
    );
    expect(html).toContain("Noch keine Läufe.");
  });
});

describe("FeedTestResult", () => {
  it("meldet Zähler und unbekannte Typen", () => {
    const html = renderToStaticMarkup(
      createElement(FeedTestResult, {
        test: {
          absences: 3,
          cancelled: 0,
          events: 21,
          unknownTypes: ["HOMEOFFICE"],
        },
      }),
    );
    expect(html).toContain("3 Abwesenheiten, 21 Events, 1 unbekannter Typ");
    expect(html).toContain("HOMEOFFICE");
  });
});
