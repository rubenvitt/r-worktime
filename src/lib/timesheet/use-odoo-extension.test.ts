// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOdooExtension } from "@/hooks/use-odoo-extension";

type Posted = { message: Record<string, unknown>; targetOrigin: string };

let posted: Posted[];

function receive(data: Record<string, unknown>, source: unknown = window) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin: window.location.origin,
        source: source as Window,
      }),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  posted = [];
  vi.spyOn(window, "postMessage").mockImplementation(((
    message: Record<string, unknown>,
    targetOrigin: string,
  ) => {
    posted.push({ message, targetOrigin });
  }) as typeof window.postMessage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const entries = [
  { date: "2026-09-01", hours: "8:00", text: "Alpha", travelFee: false },
];

describe("useOdooExtension", () => {
  it("pingt an den eigenen Origin und meldet ohne Antwort absent", () => {
    const { result } = renderHook(() => useOdooExtension());
    expect(result.current.status).toBe("unknown");

    const ping = posted.find((p) => p.message.type === "RWT_PING");
    expect(ping?.targetOrigin).toBe(window.location.origin);
    expect(ping?.message).toMatchObject({ source: "r-worktime", protocol: 1 });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.status).toBe("absent");
  });

  it("wird mit PONG present, ignoriert fremde Fenster", () => {
    const { result } = renderHook(() => useOdooExtension());
    const pong = {
      source: "rwt-extension",
      type: "RWT_PONG",
      requestId: "x",
      version: "1.1.0",
      protocol: 1,
    };
    receive(pong, {});
    expect(result.current.status).toBe("unknown");

    receive(pong);
    expect(result.current.status).toBe("present");
    expect(result.current.version).toBe("1.1.0");

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.status).toBe("present");
  });

  it("löst send mit dem passenden ACK auf", async () => {
    const { result } = renderHook(() => useOdooExtension());
    let promise!: ReturnType<typeof result.current.send>;
    act(() => {
      promise = result.current.send("2026-09", entries);
    });

    const sent = posted.find((p) => p.message.type === "RWT_TIMESHEET");
    expect(sent?.message).toMatchObject({
      source: "r-worktime",
      protocol: 1,
      payload: { month: "2026-09", entries },
    });

    const requestId = sent?.message.requestId as string;
    receive({
      source: "rwt-extension",
      type: "RWT_TIMESHEET_ACK",
      requestId: "fremd",
      ok: true,
      count: 99,
    });
    receive({
      source: "rwt-extension",
      type: "RWT_TIMESHEET_ACK",
      requestId,
      ok: true,
      count: 1,
    });
    await expect(promise).resolves.toEqual({ ok: true, count: 1 });
  });

  it("meldet TIMEOUT ohne ACK nach 3 s", async () => {
    const { result } = renderHook(() => useOdooExtension());
    let promise!: ReturnType<typeof result.current.send>;
    act(() => {
      promise = result.current.send("2026-09", entries);
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    await expect(promise).resolves.toEqual({ ok: false, error: "TIMEOUT" });
  });
});
