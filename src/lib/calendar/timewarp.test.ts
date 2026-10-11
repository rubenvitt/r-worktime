import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseTimewarpFeed,
  splitSummary,
  summarizeFeed,
  TimewarpParseError,
} from "./timewarp";

// Anonymisiert, aber in der Struktur des echten Timewarp-Feeds
const FEED = readFileSync(
  join(__dirname, "__fixtures__", "timewarp-feed.ics"),
  "utf8",
);

function calendar(...events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//DE",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

function vevent(lines: string[]): string {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
}

describe("splitSummary", () => {
  it("trennt Name, Typ und halben Tag", () => {
    expect(splitSummary("Max Muster: URLAUB")).toEqual({
      rawType: "URLAUB",
      halfDay: false,
    });
    expect(splitSummary("Max Muster: RESTURLAUB (halber Tag)")).toEqual({
      rawType: "RESTURLAUB",
      halfDay: true,
    });
    expect(splitSummary("Max: Muster: Event: Köln")).toEqual({
      rawType: "Muster: Event: Köln",
      halfDay: false,
    });
    expect(splitSummary("URLAUB")).toEqual({
      rawType: "URLAUB",
      halfDay: false,
    });
  });
});

describe("parseTimewarpFeed mit dem Beispiel-Feed", () => {
  const result = parseTimewarpFeed(FEED);
  const byUid = new Map(result.absences.map((a) => [a.uid, a]));

  it("liest Urlaub mit exklusivem Ende", () => {
    expect(byUid.get("absence-1001@timewarp.example")).toEqual({
      uid: "absence-1001@timewarp.example",
      sequence: 2,
      kind: "VACATION",
      rawType: "URLAUB",
      startDate: "2026-12-21",
      endDate: "2026-12-23",
      halfDay: false,
      cancelled: false,
    });
  });

  it("liest Resturlaub als halben Tag", () => {
    expect(byUid.get("absence-1002@timewarp.example")).toMatchObject({
      kind: "RESIDUAL_VACATION",
      rawType: "RESTURLAUB",
      startDate: "2026-10-30",
      endDate: "2026-10-30",
      halfDay: true,
    });
  });

  it("erkennt Stornos an STATUS, nicht an METHOD:CANCEL im Kopf", () => {
    expect(byUid.get("absence-1003@timewarp.example")?.cancelled).toBe(true);
    expect(
      result.absences.filter((a) => a.cancelled).map((a) => a.uid),
    ).toEqual(["absence-1003@timewarp.example"]);
  });

  it("zählt Events (auch mit DTEND = DTSTART) und übernimmt sie nicht", () => {
    expect(result.events).toBe(1);
    expect(byUid.has("event-2001@timewarp.example")).toBe(false);
  });

  it("vereinheitlicht Umlaut-Varianten", () => {
    expect(byUid.get("absence-1004@timewarp.example")?.kind).toBe(
      "OVERTIME_REDUCTION",
    );
    expect(byUid.get("absence-1005@timewarp.example")).toMatchObject({
      kind: "OVERTIME_REDUCTION",
      rawType: "Überstundenabbau",
      endDate: "2027-02-02",
    });
  });

  it("meldet unbekannte Typen und überspringt nicht ganztägige Termine", () => {
    expect(result.unknown).toEqual([
      {
        uid: "absence-1006@timewarp.example",
        rawType: "WORKATION",
        startDate: "2027-03-01",
      },
    ]);
    expect(result.unknownTypes).toEqual(["WORKATION"]);
    expect(result.skipped).toBe(1);
    expect(result.totalEvents).toBe(8);
  });

  it("sortiert nach Beginn", () => {
    expect(result.absences.map((a) => a.startDate)).toEqual([
      "2026-10-30",
      "2026-11-16",
      "2026-12-21",
      "2027-01-04",
      "2027-02-01",
    ]);
  });

  it("fasst für den Testabruf zusammen", () => {
    expect(summarizeFeed(result)).toEqual({
      absences: 4,
      cancelled: 1,
      events: 1,
      unknownTypes: ["WORKATION"],
    });
  });
});

describe("parseTimewarpFeed – Randfälle", () => {
  it("nimmt bei doppelter UID die höchste SEQUENCE", () => {
    const ics = calendar(
      vevent([
        "UID:a",
        "SEQUENCE:3",
        "DTSTART;VALUE=DATE:20261201",
        "DTEND;VALUE=DATE:20261203",
        "SUMMARY:X: URLAUB",
      ]),
      vevent([
        "UID:a",
        "SEQUENCE:1",
        "DTSTART;VALUE=DATE:20261101",
        "DTEND;VALUE=DATE:20261102",
        "SUMMARY:X: URLAUB",
      ]),
    );
    const [absence] = parseTimewarpFeed(ics).absences;
    expect(absence).toMatchObject({ sequence: 3, startDate: "2026-12-01" });
  });

  it("wertet einen Tag ohne DTEND und Groß-/Kleinschreibung", () => {
    const ics = calendar(
      vevent([
        "UID:b",
        "DTSTART;VALUE=DATE:20261201",
        "STATUS:cancelled",
        "SUMMARY:X: sonderurlaub",
      ]),
    );
    expect(parseTimewarpFeed(ics).absences[0]).toMatchObject({
      kind: "SPECIAL_LEAVE",
      startDate: "2026-12-01",
      endDate: "2026-12-01",
      sequence: null,
      cancelled: true,
    });
  });

  it("überspringt VEVENTs ohne UID", () => {
    const ics = calendar(
      vevent(["DTSTART;VALUE=DATE:20261201", "SUMMARY:X: URLAUB"]),
    );
    const result = parseTimewarpFeed(ics);
    expect(result.absences).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it("liefert einen leeren Kalender ohne Fehler", () => {
    const result = parseTimewarpFeed(calendar());
    expect(result.totalEvents).toBe(0);
    expect(result.absences).toEqual([]);
  });

  it("wirft bei Unsinn", () => {
    expect(() => parseTimewarpFeed("<html>Login</html>")).toThrow(
      TimewarpParseError,
    );
    expect(() =>
      parseTimewarpFeed("BEGIN:VCARD\r\nVERSION:4.0\r\nEND:VCARD"),
    ).toThrow(TimewarpParseError);
  });
});
