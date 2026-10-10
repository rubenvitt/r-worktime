// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimesheetResponse } from "@/lib/timesheet/types";
import {
  applyTravelDecision,
  resetLegacyTravelImport,
  useLegacyTravelImport,
} from "./use-travel-days";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

/** Speicher im Arbeitsspeicher – Node bringt ein eigenes, hier leeres localStorage mit. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, String(value));
    },
  };
}

beforeEach(() => {
  resetLegacyTravelImport();
  Object.defineProperty(window, "localStorage", {
    value: memoryStorage(),
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useLegacyTravelImport", () => {
  it("übernimmt alte Korrekturen und entfernt danach die Schlüssel", async () => {
    window.localStorage.setItem(
      "rwt.timesheet.travel.2026-09",
      JSON.stringify({ "2026-09-01": true }),
    );
    window.localStorage.setItem(
      "rwt.timesheet.travel.2026-10",
      JSON.stringify({ "2026-10-02": false }),
    );
    window.localStorage.setItem("rwt.timesheet.prefs", "{}");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ imported: 2 }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useLegacyTravelImport(), { wrapper: wrapper(client) });

    await waitFor(() =>
      expect(
        window.localStorage.getItem("rwt.timesheet.travel.2026-09"),
      ).toBeNull(),
    );
    expect(window.localStorage.getItem("rwt.timesheet.travel.2026-10")).toBe(
      null,
    );
    expect(window.localStorage.getItem("rwt.timesheet.prefs")).toBe("{}");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/travel-days/import");
    expect(JSON.parse(init.body)).toEqual({
      decisions: [
        { date: "2026-09-01", isTravel: true },
        { date: "2026-10-02", isTravel: false },
      ],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["timesheet"] });
  });

  it("behält die Schlüssel, wenn der Server ablehnt", async () => {
    window.localStorage.setItem(
      "rwt.timesheet.travel.2026-09",
      JSON.stringify({ "2026-09-01": true }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() => useLegacyTravelImport(), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(
      window.localStorage.getItem("rwt.timesheet.travel.2026-09"),
    ).not.toBeNull();
  });

  it("räumt Schlüssel ohne gültige Werte ohne Anfrage weg", async () => {
    window.localStorage.setItem("rwt.timesheet.travel.2026-09", "{kaputt");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useLegacyTravelImport(), {
      wrapper: wrapper(new QueryClient()),
    });

    await waitFor(() =>
      expect(
        window.localStorage.getItem("rwt.timesheet.travel.2026-09"),
      ).toBeNull(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("applyTravelDecision", () => {
  const base = {
    days: [
      { date: "2026-09-01", travelFee: true, travelOverride: null },
      { date: "2026-09-02", travelFee: false, travelOverride: null },
    ],
    payload: [
      { date: "2026-09-01", hours: "8:00", text: "A", travelFee: true },
      { date: "2026-09-02", hours: "8:00", text: "B", travelFee: false },
    ],
  } as unknown as TimesheetResponse;

  it("setzt Festlegung und effektiven Payload-Wert", async () => {
    const next = applyTravelDecision(base, {
      date: "2026-09-01",
      isTravel: false,
    });
    expect(next.days[0].travelOverride).toBe(false);
    expect(next.payload.map((p) => p.travelFee)).toEqual([false, false]);
  });

  it("fällt beim Zurücksetzen auf den Vorschlag zurück", async () => {
    const changed = applyTravelDecision(base, {
      date: "2026-09-02",
      isTravel: true,
    });
    expect(changed.payload[1].travelFee).toBe(true);
    const reset = applyTravelDecision(changed, {
      date: "2026-09-02",
      isTravel: null,
    });
    expect(reset.days[1].travelOverride).toBeNull();
    expect(reset.payload[1].travelFee).toBe(false);
  });
});
