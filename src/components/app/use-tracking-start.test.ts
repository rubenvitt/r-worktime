// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TRACKING_START_KEY, useTrackingStart } from "./use-tracking-start";

function Probe() {
  const { isLoading, adjustmentDate } = useTrackingStart();
  return createElement(
    "p",
    null,
    isLoading ? "lädt" : (adjustmentDate ?? "kein Saldo"),
  );
}

function app(client: QueryClient) {
  return createElement(QueryClientProvider, { client }, createElement(Probe));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useTrackingStart", () => {
  it("hydriert ohne Abweichung, auch wenn der Cache schon Daten hat", async () => {
    // Antwort hängt, damit nur der Cache-Inhalt zählt
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const html = renderToString(app(new QueryClient()));
    expect(html).toContain("lädt");

    // Seitenleiste hat den Anfangs-Saldo schon geladen, bevor die Seite hydriert
    const client = new QueryClient();
    client.setQueryData(TRACKING_START_KEY, {
      id: "a1",
      date: "2026-07-31T00:00:00.000Z",
      hours: 12.5,
      description: null,
    });
    const container = document.createElement("div");
    container.innerHTML = html;
    const recoverable = vi.fn();
    await act(async () => {
      hydrateRoot(container, app(client), {
        onRecoverableError: recoverable,
      });
    });

    expect(recoverable).not.toHaveBeenCalled();
    // Nach der Hydration erscheinen die Daten aus dem Cache
    expect(container.textContent).toBe("2026-07-31");
  });
});
