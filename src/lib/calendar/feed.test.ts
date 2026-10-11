import { describe, expect, it, vi } from "vitest";
import {
  allowedFeedHosts,
  CalendarFeedError,
  feedHostOf,
  fetchCalendarFeed,
  validateFeedUrl,
} from "./feed";

const TOKEN = "geheimes-token-123";
const URL_OK = `https://timewarp.innoq.io/export/${TOKEN}/calendar.ics`;
const HOSTS = ["timewarp.innoq.io"];

function textResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, { status: 200, ...init });
}

async function feedError(
  promise: Promise<unknown>,
): Promise<CalendarFeedError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CalendarFeedError);
    const feedErr = error as CalendarFeedError;
    // Nie die URL oder das Token in der Meldung
    expect(feedErr.message).not.toContain(TOKEN);
    expect(feedErr.message).not.toContain("/export/");
    return feedErr;
  }
  throw new Error("Fehler erwartet");
}

describe("allowedFeedHosts", () => {
  it("nimmt Timewarp als Standard", () => {
    expect(allowedFeedHosts(undefined)).toEqual(["timewarp.innoq.io"]);
    expect(allowedFeedHosts(" ")).toEqual(["timewarp.innoq.io"]);
  });

  it("liest eine kommagetrennte Liste", () => {
    expect(allowedFeedHosts("A.example.test, b.example.test")).toEqual([
      "a.example.test",
      "b.example.test",
    ]);
  });
});

describe("validateFeedUrl", () => {
  it("akzeptiert https auf einem erlaubten Host", () => {
    expect(validateFeedUrl(URL_OK, HOSTS).hostname).toBe("timewarp.innoq.io");
  });

  it("lehnt http, fremde Hosts, Zugangsdaten und Unsinn ab", async () => {
    expect(() =>
      validateFeedUrl(URL_OK.replace("https", "http"), HOSTS),
    ).toThrow(/https/);
    expect(() =>
      validateFeedUrl("https://evil.example.test/calendar.ics", HOSTS),
    ).toThrow(/nicht erlaubt/);
    expect(() =>
      validateFeedUrl("https://user:pw@timewarp.innoq.io/x.ics", HOSTS),
    ).toThrow(/Zugangsdaten/);
    expect(() => validateFeedUrl("kein link", HOSTS)).toThrow(/gültige URL/);
  });
});

describe("feedHostOf", () => {
  it("zeigt nur den Host", () => {
    expect(feedHostOf(URL_OK)).toBe("timewarp.innoq.io");
    expect(feedHostOf(null)).toBeNull();
    expect(feedHostOf("kaputt")).toBeNull();
  });
});

describe("fetchCalendarFeed", () => {
  it("lädt den Feed ohne automatische Weiterleitung", async () => {
    const fetchImpl = vi.fn(async () => textResponse("BEGIN:VCALENDAR"));
    await expect(
      fetchCalendarFeed(URL_OK, {
        hosts: HOSTS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe("BEGIN:VCALENDAR");
    expect(fetchImpl).toHaveBeenCalledWith(
      URL_OK,
      expect.objectContaining({ redirect: "manual", method: "GET" }),
    );
  });

  it("folgt Weiterleitungen auf erlaubte Hosts", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/export/neu/calendar.ics" },
        }),
      )
      .mockResolvedValueOnce(textResponse("OK"));
    await expect(
      fetchCalendarFeed(URL_OK, { hosts: HOSTS, fetchImpl }),
    ).resolves.toBe("OK");
    expect(fetchImpl.mock.calls[1][0]).toBe(
      "https://timewarp.innoq.io/export/neu/calendar.ics",
    );
  });

  it("bricht bei Weiterleitung auf einen fremden Host ab", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 301,
          headers: { location: `https://evil.example.test/?t=${TOKEN}` },
        }),
    );
    const error = await feedError(
      fetchCalendarFeed(URL_OK, {
        hosts: HOSTS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );
    expect(error.code).toBe("REDIRECT");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("bricht bei Weiterleitung auf http ab", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://timewarp.innoq.io/calendar.ics" },
        }),
    );
    const error = await feedError(
      fetchCalendarFeed(URL_OK, {
        hosts: HOSTS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );
    expect(error.code).toBe("REDIRECT");
  });

  it("bricht nach zu vielen Weiterleitungen ab", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "/again.ics" },
        }),
    );
    const error = await feedError(
      fetchCalendarFeed(URL_OK, {
        hosts: HOSTS,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );
    expect(error.code).toBe("REDIRECT");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("meldet eine Zeitüberschreitung", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const error = await feedError(
      fetchCalendarFeed(URL_OK, {
        hosts: HOSTS,
        timeoutMs: 20,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    );
    expect(error.code).toBe("TIMEOUT");
  });

  it("lehnt zu große Feeds ab (Content-Length und gestreamt)", async () => {
    const declared = vi.fn(async () =>
      textResponse("x", { headers: { "content-length": "5000" } }),
    );
    expect(
      (
        await feedError(
          fetchCalendarFeed(URL_OK, {
            hosts: HOSTS,
            maxBytes: 100,
            fetchImpl: declared as unknown as typeof fetch,
          }),
        )
      ).code,
    ).toBe("TOO_LARGE");

    const streamed = vi.fn(async () => textResponse("x".repeat(500)));
    expect(
      (
        await feedError(
          fetchCalendarFeed(URL_OK, {
            hosts: HOSTS,
            maxBytes: 100,
            fetchImpl: streamed as unknown as typeof fetch,
          }),
        )
      ).code,
    ).toBe("TOO_LARGE");
  });

  it("gibt Netzwerk- und HTTP-Fehler ohne URL weiter", async () => {
    const network = vi.fn(async () => {
      throw new TypeError(`fetch failed for ${URL_OK}`);
    });
    expect(
      (
        await feedError(
          fetchCalendarFeed(URL_OK, {
            hosts: HOSTS,
            fetchImpl: network as unknown as typeof fetch,
          }),
        )
      ).code,
    ).toBe("NETWORK");

    const notFound = vi.fn(async () => new Response("nope", { status: 404 }));
    const error = await feedError(
      fetchCalendarFeed(URL_OK, {
        hosts: HOSTS,
        fetchImpl: notFound as unknown as typeof fetch,
      }),
    );
    expect(error.code).toBe("HTTP");
    expect(error.status).toBe(404);
  });

  it("ruft für eine nicht erlaubte URL gar nicht erst ab", async () => {
    const fetchImpl = vi.fn();
    const error = await feedError(
      fetchCalendarFeed("https://evil.example.test/x.ics", {
        hosts: HOSTS,
        fetchImpl,
      }),
    );
    expect(error.code).toBe("HOST_NOT_ALLOWED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
