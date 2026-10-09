import { BERLIN_TIME_ZONE, isDateKey, shiftDateKey } from "@/lib/dates";

// Client für die Timing Web REST API (https://web.timingapp.com/docs/).
// IDs ("self") bleiben immer Strings – sie sind größer als MAX_SAFE_INTEGER.

export const DEFAULT_TIMING_API_BASE_URL = "https://web.timingapp.com/api/v1";

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PAGES_PER_CHUNK = 50;

export interface TimingApiProject {
  self: string;
  title?: string;
  title_chain?: string[];
}

export interface TimingApiTimeEntry {
  self: string;
  start_date: string;
  end_date: string | null;
  duration: number | null;
  project: TimingApiProject | null;
  title: string | null;
  notes: string | null;
  is_running: boolean;
  billing_status?: string | null;
}

interface TimingListResponse<T> {
  data: T[];
  links?: { next?: string | null };
}

export type TimingApiErrorCode =
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "HTTP_ERROR"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE";

export class TimingApiError extends Error {
  constructor(
    public readonly code: TimingApiErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "TimingApiError";
  }
}

export interface DateRange {
  /** "YYYY-MM-DD", inklusive */
  from: string;
  /** "YYYY-MM-DD", inklusive */
  to: string;
}

export interface TimingClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface TimingClient {
  listTimeEntries(range: DateRange): Promise<TimingApiTimeEntry[]>;
  testConnection(): Promise<{ projectCount: number }>;
}

export function resolveBaseUrl(
  baseUrl: string | undefined = process.env.TIMING_API_BASE_URL,
): string {
  return (baseUrl?.trim() || DEFAULT_TIMING_API_BASE_URL).replace(/\/+$/, "");
}

/**
 * Zerlegt einen Zeitraum in nicht überlappende Monats-Abschnitte (Enden inklusiv).
 */
export function splitIntoMonthChunks(range: DateRange): DateRange[] {
  if (!isDateKey(range.from) || !isDateKey(range.to)) {
    throw new RangeError("Ungültiger Zeitraum");
  }
  if (range.from > range.to) {
    throw new RangeError("Der Start liegt nach dem Ende");
  }

  const chunks: DateRange[] = [];
  let from = range.from;
  while (from <= range.to) {
    const [y, m] = from.split("-").map(Number);
    const lastOfMonth = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const to = lastOfMonth < range.to ? lastOfMonth : range.to;
    chunks.push({ from, to });
    from = shiftDateKey(to, 1);
  }
  return chunks;
}

function errorForStatus(status: number): TimingApiError {
  if (status === 401 || status === 403) {
    return new TimingApiError(
      "UNAUTHORIZED",
      "Token ungültig oder ohne Berechtigung. Erzeuge einen neuen API-Key in Timing.",
      status,
    );
  }
  if (status === 429) {
    return new TimingApiError(
      "RATE_LIMITED",
      "Rate-Limit der Timing-API erreicht. Versuch es später noch einmal.",
      status,
    );
  }
  return new TimingApiError(
    "HTTP_ERROR",
    `Timing-API antwortet mit HTTP ${status}.`,
    status,
  );
}

export function createTimingClient(options: TimingClientOptions): TimingClient {
  const token = options.token.trim();
  if (!token) {
    throw new TimingApiError(
      "UNAUTHORIZED",
      "Kein Timing-API-Token hinterlegt.",
    );
  }
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const baseOrigin = new URL(baseUrl).origin;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  async function getJson<T>(url: string): Promise<T> {
    // Token nur an den konfigurierten Host schicken
    if (new URL(url).origin !== baseOrigin) {
      throw new TimingApiError(
        "INVALID_RESPONSE",
        "Timing-API verweist auf einen fremden Host – Abbruch.",
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "X-Time-Zone": BERLIN_TIME_ZONE,
        },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      throw new TimingApiError(
        "NETWORK_ERROR",
        isTimeout
          ? "Timing-API antwortet nicht (Zeitüberschreitung)."
          : "Timing-API nicht erreichbar.",
      );
    }

    if (!response.ok) {
      throw errorForStatus(response.status);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new TimingApiError(
        "INVALID_RESPONSE",
        "Timing-API liefert keine gültige JSON-Antwort.",
        response.status,
      );
    }
  }

  // next-Links immer auf den konfigurierten Host umbiegen (Pfad und Query bleiben),
  // damit der Token nie an einen anderen Host geht.
  function resolveNextUrl(next: string): string {
    const resolved = new URL(next, `${baseUrl}/`);
    if (resolved.origin === baseOrigin) return resolved.toString();
    return `${baseOrigin}${resolved.pathname}${resolved.search}`;
  }

  async function listChunk(chunk: DateRange): Promise<TimingApiTimeEntry[]> {
    const params = new URLSearchParams({
      start_date_min: chunk.from,
      start_date_max: chunk.to,
      include_project_data: "1",
    });
    let url: string | null = `${baseUrl}/time-entries?${params.toString()}`;
    const visited = new Set<string>();
    const entries: TimingApiTimeEntry[] = [];

    while (url) {
      if (visited.has(url) || visited.size >= MAX_PAGES_PER_CHUNK) {
        throw new TimingApiError(
          "INVALID_RESPONSE",
          "Paginierung der Timing-API endet nicht.",
        );
      }
      visited.add(url);

      const page: TimingListResponse<TimingApiTimeEntry> =
        await getJson<TimingListResponse<TimingApiTimeEntry>>(url);
      if (!Array.isArray(page?.data)) {
        throw new TimingApiError(
          "INVALID_RESPONSE",
          "Unerwartetes Antwortformat der Timing-API.",
        );
      }
      entries.push(...page.data);

      url = page.links?.next ? resolveNextUrl(page.links.next) : null;
    }
    return entries;
  }

  return {
    async listTimeEntries(range) {
      const byId = new Map<string, TimingApiTimeEntry>();
      for (const chunk of splitIntoMonthChunks(range)) {
        for (const entry of await listChunk(chunk)) {
          // Seiten können sich während der Abfrage verschieben → nach self deduplizieren
          if (typeof entry?.self === "string") {
            byId.set(entry.self, entry);
          }
        }
      }
      return Array.from(byId.values());
    },

    async testConnection() {
      const response = await getJson<TimingListResponse<unknown>>(
        `${baseUrl}/projects?hide_archived=1`,
      );
      if (!Array.isArray(response?.data)) {
        throw new TimingApiError(
          "INVALID_RESPONSE",
          "Unerwartetes Antwortformat der Timing-API.",
        );
      }
      return { projectCount: response.data.length };
    },
  };
}
