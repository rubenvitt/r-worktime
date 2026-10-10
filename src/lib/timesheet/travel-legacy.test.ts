import { describe, expect, it } from "vitest";
import {
  LEGACY_TRAVEL_PREFIX,
  legacyTravelKey,
  parseLegacyTravelStorage,
} from "./travel-legacy";

describe("parseLegacyTravelStorage", () => {
  it("liest alle Monate mit dem alten Präfix", () => {
    const result = parseLegacyTravelStorage([
      [
        legacyTravelKey("2026-09"),
        JSON.stringify({ "2026-09-01": true, "2026-09-02": false }),
      ],
      [legacyTravelKey("2026-10"), JSON.stringify({ "2026-10-05": true })],
      ["rwt.timesheet.prefs", JSON.stringify({ rounding: 15 })],
    ]);
    expect(result.keys).toEqual([
      "rwt.timesheet.travel.2026-09",
      "rwt.timesheet.travel.2026-10",
    ]);
    expect(result.decisions).toEqual([
      { date: "2026-09-01", isTravel: true },
      { date: "2026-09-02", isTravel: false },
      { date: "2026-10-05", isTravel: true },
    ]);
  });

  it("überspringt kaputte Werte, merkt sich die Schlüssel aber zum Aufräumen", () => {
    const result = parseLegacyTravelStorage([
      [legacyTravelKey("2026-08"), "{kaputt"],
      [legacyTravelKey("2026-07"), JSON.stringify([true])],
      [legacyTravelKey("2026-06"), null],
      [
        legacyTravelKey("2026-05"),
        JSON.stringify({
          "2026-05-04": "ja",
          "2026-05-31": true,
          // gehört nicht in den Monat des Schlüssels
          "2026-06-01": true,
          "2026-05-32": true,
        }),
      ],
      [`${LEGACY_TRAVEL_PREFIX}irgendwas`, JSON.stringify({})],
    ]);
    expect(result.keys).toHaveLength(5);
    expect(result.decisions).toEqual([{ date: "2026-05-31", isTravel: true }]);
  });

  it("liefert nichts ohne alte Schlüssel", () => {
    expect(parseLegacyTravelStorage([])).toEqual({ keys: [], decisions: [] });
  });
});
