// Lädt den Timewarp-Kalenderfeed (ICS). Die URL enthält ein geheimes Token:
// nur https, nur Hosts aus der Allowlist (auch bei Weiterleitungen), und kein
// Fehlertext enthält URL oder Token.

export const CALENDAR_FEED_HOSTS_ENV = "CALENDAR_FEED_HOSTS";
export const DEFAULT_CALENDAR_FEED_HOSTS = ["timewarp.innoq.io"];

export const FEED_TIMEOUT_MS = 10_000;
export const FEED_MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export type CalendarFeedErrorCode =
  | "INVALID_URL"
  | "HOST_NOT_ALLOWED"
  | "REDIRECT"
  | "TIMEOUT"
  | "NETWORK"
  | "HTTP"
  | "TOO_LARGE";

/** Fehler beim Laden des Feeds; die Meldung ist für die Oberfläche gedacht. */
export class CalendarFeedError extends Error {
  constructor(
    public readonly code: CalendarFeedErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CalendarFeedError";
  }
}

/** Erlaubte Hosts aus CALENDAR_FEED_HOSTS (kommagetrennt), sonst Timewarp. */
export function allowedFeedHosts(
  raw: string | undefined = process.env[CALENDAR_FEED_HOSTS_ENV],
): string[] {
  const hosts = (raw ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : DEFAULT_CALENDAR_FEED_HOSTS;
}

/**
 * Prüft eine Feed-URL: https und Host in der Allowlist. Wirft
 * CalendarFeedError mit deutscher Meldung (ohne die URL selbst).
 */
export function validateFeedUrl(
  raw: string,
  hosts: readonly string[] = allowedFeedHosts(),
): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new CalendarFeedError("INVALID_URL", "Das ist keine gültige URL.");
  }
  if (url.protocol !== "https:") {
    throw new CalendarFeedError(
      "INVALID_URL",
      "Die Feed-URL muss mit https:// beginnen.",
    );
  }
  if (url.username || url.password) {
    throw new CalendarFeedError(
      "INVALID_URL",
      "Die Feed-URL darf keine Zugangsdaten enthalten.",
    );
  }
  if (!hosts.includes(url.hostname.toLowerCase())) {
    throw new CalendarFeedError(
      "HOST_NOT_ALLOWED",
      `Der Host ${url.hostname} ist nicht erlaubt (erlaubt: ${hosts.join(", ")}).`,
    );
  }
  return url;
}

/** Host einer gespeicherten Feed-URL für die Anzeige, sonst null. */
export function feedHostOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

export interface FetchFeedOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  hosts?: readonly string[];
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

async function readLimited(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const tooLarge = () =>
    new CalendarFeedError(
      "TOO_LARGE",
      `Der Feed ist größer als ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    );
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/**
 * Lädt den Feed als Text. Weiterleitungen werden einzeln verfolgt und jede
 * Station gegen https und die Allowlist geprüft.
 */
export async function fetchCalendarFeed(
  rawUrl: string,
  options: FetchFeedOptions = {},
): Promise<string> {
  const hosts = options.hosts ?? allowedFeedHosts();
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? FEED_MAX_BYTES;
  const signal = AbortSignal.timeout(options.timeoutMs ?? FEED_TIMEOUT_MS);

  let url = validateFeedUrl(rawUrl, hosts);
  try {
    for (let hop = 0; ; hop++) {
      let response: Response;
      try {
        response = await fetchImpl(url.toString(), {
          method: "GET",
          redirect: "manual",
          headers: { Accept: "text/calendar, text/plain;q=0.5" },
          signal,
          cache: "no-store",
        });
      } catch (error) {
        if (isAbort(error)) throw error;
        // Meldungen von fetch/undici können Teile der URL enthalten → nicht weitergeben
        throw new CalendarFeedError(
          "NETWORK",
          "Der Kalender-Feed ist nicht erreichbar.",
        );
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || hop >= MAX_REDIRECTS) {
          throw new CalendarFeedError(
            "REDIRECT",
            "Der Kalender-Feed leitet zu oft oder ohne Ziel weiter.",
            response.status,
          );
        }
        let next: URL;
        try {
          next = validateFeedUrl(new URL(location, url).toString(), hosts);
        } catch {
          throw new CalendarFeedError(
            "REDIRECT",
            "Der Kalender-Feed leitet auf einen nicht erlaubten Host weiter.",
            response.status,
          );
        }
        url = next;
        continue;
      }

      if (!response.ok) {
        throw new CalendarFeedError(
          "HTTP",
          response.status === 404 || response.status === 410
            ? `Der Kalender-Feed wurde nicht gefunden (HTTP ${response.status}). Ist die URL noch gültig?`
            : `Der Kalender-Feed antwortet mit HTTP ${response.status}.`,
          response.status,
        );
      }
      return await readLimited(response, maxBytes);
    }
  } catch (error) {
    if (error instanceof CalendarFeedError) throw error;
    if (isAbort(error)) {
      throw new CalendarFeedError(
        "TIMEOUT",
        "Der Kalender-Feed antwortet nicht (Zeitüberschreitung).",
      );
    }
    throw new CalendarFeedError(
      "NETWORK",
      "Der Kalender-Feed konnte nicht gelesen werden.",
    );
  }
}
