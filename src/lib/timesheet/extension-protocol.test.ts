import { describe, expect, it } from "vitest";
import {
  MAX_TEXT_LENGTH,
  parseExtensionMessage,
  validateTimesheetPayload,
} from "./extension-protocol";

const win = {};
const origin = "http://localhost:3000";
const expected = { window: win, origin };

describe("parseExtensionMessage", () => {
  const pong = {
    source: "rwt-extension",
    type: "RWT_PONG",
    requestId: "r1",
    version: "1.1.0",
    protocol: 1,
  };

  it("akzeptiert PONG aus demselben Fenster und Origin", () => {
    expect(
      parseExtensionMessage({ source: win, origin, data: pong }, expected),
    ).toEqual(pong);
  });

  it("verwirft fremde Fenster, Origins, Quellen und Protokolle", () => {
    expect(
      parseExtensionMessage({ source: {}, origin, data: pong }, expected),
    ).toBeNull();
    expect(
      parseExtensionMessage(
        { source: win, origin: "https://evil.example", data: pong },
        expected,
      ),
    ).toBeNull();
    expect(
      parseExtensionMessage(
        { source: win, origin, data: { ...pong, source: "r-worktime" } },
        expected,
      ),
    ).toBeNull();
    expect(
      parseExtensionMessage(
        { source: win, origin, data: { ...pong, protocol: 2 } },
        expected,
      ),
    ).toBeNull();
    expect(
      parseExtensionMessage({ source: win, origin, data: "x" }, expected),
    ).toBeNull();
  });

  it("akzeptiert ACKs mit requestId und ok", () => {
    const ack = {
      source: "rwt-extension",
      type: "RWT_TIMESHEET_ACK",
      requestId: "r2",
      ok: true,
      count: 3,
    };
    expect(
      parseExtensionMessage({ source: win, origin, data: ack }, expected),
    ).toEqual(ack);
    expect(
      parseExtensionMessage(
        { source: win, origin, data: { ...ack, requestId: 5 } },
        expected,
      ),
    ).toBeNull();
  });
});

describe("validateTimesheetPayload", () => {
  const ok = {
    month: "2026-09",
    generatedAt: "2026-10-09T12:00:00.000Z",
    entries: [
      { date: "2026-09-01", hours: "8:30", text: "Alpha", travelFee: false },
      { date: "2026-09-02", hours: "0:15", text: "Beta", travelFee: true },
    ],
  };

  it("lässt einen gültigen Monat durch", () => {
    expect(validateTimesheetPayload(ok)).toEqual([]);
  });

  it("meldet leere Monate, fremde und doppelte Daten, zu lange Texte", () => {
    expect(validateTimesheetPayload({ ...ok, entries: [] })).toHaveLength(1);

    const issues = validateTimesheetPayload({
      ...ok,
      entries: [
        { date: "2026-10-01", hours: "1:00", text: "x", travelFee: false },
        { date: "2026-09-02", hours: "1:00", text: "x", travelFee: false },
        { date: "2026-09-02", hours: "1:00", text: "x", travelFee: false },
        {
          date: "2026-09-03",
          hours: "1:00",
          text: "y".repeat(MAX_TEXT_LENGTH + 1),
          travelFee: false,
        },
      ],
    });
    expect(issues.map((i) => i.date)).toEqual([
      "2026-10-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });
});
