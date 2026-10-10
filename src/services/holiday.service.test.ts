import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HolidayService, loadOfficialHolidays } from "./holiday.service";

function apiResponse(feiertage: Array<Record<string, string>>) {
  return {
    ok: true,
    statusText: "OK",
    json: async () => ({ status: "success", feiertage }),
  };
}

const HOLIDAYS_2026: Array<Record<string, string>> = [
  { date: "2026-12-25", fname: "1. Weihnachtstag", all_states: "1" },
  // Samstag: wird mitgeliefert, der Aufrufer prüft die Arbeitstage
  { date: "2026-10-03", fname: "Tag der Deutschen Einheit", all_states: "1" },
  { date: "2026-10-31", fname: "Reformationstag", all_states: "0", ni: "1" },
  // Nur in anderen Ländern
  { date: "2026-01-06", fname: "Heilige Drei Könige", all_states: "0" },
];

describe("HolidayService.fetchHolidaysForYear", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("liefert alle Feiertage in Niedersachsen, auch am Wochenende", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(apiResponse(HOLIDAYS_2026)),
    );
    const holidays = await new HolidayService().fetchHolidaysForYear(2026);
    expect(holidays.map((h) => h.date)).toEqual([
      "2026-10-03",
      "2026-10-31",
      "2026-12-25",
    ]);
  });

  it("wertet eine Antwort ohne Feiertage als Fehler", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        statusText: "OK",
        json: async () => ({ status: "error" }),
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      new HolidayService().fetchHolidaysForYear(2026),
    ).rejects.toThrow();
  });
});

describe("loadOfficialHolidays", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("meldet nicht erreichbare Jahre, statt zu werfen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("years=2031")
          ? apiResponse([
              {
                date: "2031-12-25",
                fname: "1. Weihnachtstag",
                all_states: "1",
              },
            ])
          : { ok: false, statusText: "Service Unavailable" },
      ),
    );
    const result = await loadOfficialHolidays([2032, 2031]);
    expect(result.names).toEqual({ "2031-12-25": "1. Weihnachtstag" });
    expect(result.unavailableYears).toEqual([2032]);
  });
});

describe("loadOfficialHolidays bei Dienstausfall", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("bricht einen hängenden Abruf nach 5 s ab und cacht den Fehlschlag nur 5 min", async () => {
    // Eigenes Jahr: der Cache lebt auf Modulebene
    const fetchMock = vi.fn(() => new Promise<never>(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const first = loadOfficialHolidays([2041]);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(first).resolves.toEqual({
      names: {},
      unavailableYears: [2041],
    });

    // Innerhalb von 5 min kein neuer Abruf, Ergebnis sofort
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    await expect(loadOfficialHolidays([2041])).resolves.toEqual({
      names: {},
      unavailableYears: [2041],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Danach erneuter Versuch
    fetchMock.mockImplementation(
      () =>
        Promise.resolve(
          apiResponse([
            { date: "2041-12-25", fname: "1. Weihnachtstag", all_states: "1" },
          ]),
        ) as never,
    );
    await vi.advanceTimersByTimeAsync(61 * 1000);
    await expect(loadOfficialHolidays([2041])).resolves.toEqual({
      names: { "2041-12-25": "1. Weihnachtstag" },
      unavailableYears: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
