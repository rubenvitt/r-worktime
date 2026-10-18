// Protokoll v1 zwischen r-worktime-Seite und Odoo-Extension (window.postMessage).
// Die Extension prüft dieselben Grenzen; hier vorab, damit nichts still scheitert.

import type { TimesheetEntry } from "./aggregate";

export const PAGE_SOURCE = "r-worktime";
export const EXTENSION_SOURCE = "rwt-extension";
export const PROTOCOL_VERSION = 1;

export const PING_TIMEOUT_MS = 500;
export const ACK_TIMEOUT_MS = 3000;

export const MAX_ENTRIES = 31;
export const MAX_TEXT_LENGTH = 500;
export const MAX_PAYLOAD_BYTES = 64 * 1024;

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HOURS_PATTERN = /^\d{1,2}([:.,]\d{1,2})?$/;

/** Fähigkeit in PONG/READY: die Extension nimmt RWT_ABSENCE an (Timewarp) */
export const ABSENCE_FEATURE = "absence";

/**
 * Abwesenheit für Timewarp (Urlaubsplaner). Die Extension merkt sie sich und
 * füllt damit den Antrag in Timewarp aus; abschicken muss Ruben selbst.
 * Beschreibung: docs/extension-timewarp.md.
 */
export interface AbsenceMessagePayload {
  /** ID des Entwurfs in r-worktime */
  draftId: string;
  /** Art wie in Timewarp, vorerst nur Urlaub */
  kind: "URLAUB";
  /** "YYYY-MM-DD", inklusive */
  from: string;
  /** "YYYY-MM-DD", inklusive */
  to: string;
  halfDay: boolean;
  /** Urlaubstage laut r-worktime (Arbeitstage ohne Feiertage) */
  workDays: number;
  note: string | null;
  generatedAt: string;
}

export interface TimesheetMessagePayload {
  month: string;
  generatedAt: string;
  entries: TimesheetEntry[];
}

export type PageMessage =
  | {
      source: typeof PAGE_SOURCE;
      type: "RWT_PING";
      requestId: string;
      // laut §3 optional; die Bridge akzeptiert PING mit und ohne
      protocol?: typeof PROTOCOL_VERSION;
    }
  | {
      source: typeof PAGE_SOURCE;
      type: "RWT_TIMESHEET";
      requestId: string;
      protocol: typeof PROTOCOL_VERSION;
      payload: TimesheetMessagePayload;
    }
  | {
      source: typeof PAGE_SOURCE;
      type: "RWT_ABSENCE";
      requestId: string;
      protocol: typeof PROTOCOL_VERSION;
      payload: AbsenceMessagePayload;
    };

export type AckError = "VALIDATION" | "TOO_LARGE" | "ORIGIN";

export type ExtensionMessage =
  | {
      source: typeof EXTENSION_SOURCE;
      type: "RWT_PONG";
      requestId?: string;
      version?: string;
      protocol: typeof PROTOCOL_VERSION;
      /** Zusätzliche Fähigkeiten, z. B. ["absence"]; fehlt bei alten Versionen */
      features?: string[];
    }
  | {
      source: typeof EXTENSION_SOURCE;
      type: "RWT_READY";
      version?: string;
      protocol: typeof PROTOCOL_VERSION;
      features?: string[];
    }
  | {
      source: typeof EXTENSION_SOURCE;
      type: "RWT_TIMESHEET_ACK" | "RWT_ABSENCE_ACK";
      requestId: string;
      ok: boolean;
      count?: number;
      error?: AckError | string;
      protocol?: typeof PROTOCOL_VERSION;
    };

interface MessageEventLike {
  source: unknown;
  origin: string;
  data: unknown;
}

/**
 * Nimmt nur Nachrichten der Extension aus demselben Fenster und Origin an.
 * ACKs dürfen `protocol` weglassen (laut Protokoll optional), PONG/READY nicht.
 */
export function parseExtensionMessage(
  event: MessageEventLike,
  expected: { window: unknown; origin: string },
): ExtensionMessage | null {
  if (event.source !== expected.window || event.origin !== expected.origin) {
    return null;
  }
  const data = event.data;
  if (!data || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  if (msg.source !== EXTENSION_SOURCE) return null;

  switch (msg.type) {
    case "RWT_PONG":
    case "RWT_READY":
      return msg.protocol === PROTOCOL_VERSION
        ? (msg as unknown as ExtensionMessage)
        : null;
    case "RWT_TIMESHEET_ACK":
    case "RWT_ABSENCE_ACK":
      if (typeof msg.requestId !== "string" || typeof msg.ok !== "boolean") {
        return null;
      }
      if (msg.protocol !== undefined && msg.protocol !== PROTOCOL_VERSION) {
        return null;
      }
      return msg as unknown as ExtensionMessage;
    default:
      return null;
  }
}

/** Fähigkeiten aus PONG/READY; unbekannte Formate zählen als keine. */
export function extensionFeatures(message: ExtensionMessage): string[] {
  if (message.type !== "RWT_PONG" && message.type !== "RWT_READY") return [];
  return Array.isArray(message.features)
    ? message.features.filter(
        (feature): feature is string => typeof feature === "string",
      )
    : [];
}

export interface PayloadIssue {
  /** betroffenes Datum, falls tagesbezogen */
  date?: string;
  message: string;
}

/** Prüft den Payload gegen das Extension-Schema; leere Liste = sendbar. */
export function validateTimesheetPayload(
  payload: TimesheetMessagePayload,
): PayloadIssue[] {
  const issues: PayloadIssue[] = [];
  const { month, entries } = payload;

  if (!MONTH_PATTERN.test(month)) {
    issues.push({ message: `Ungültiger Monat „${month}“.` });
  }
  if (entries.length === 0) {
    issues.push({ message: "Keine Tage mit Einträgen in diesem Monat." });
  }
  if (entries.length > MAX_ENTRIES) {
    issues.push({
      message: `Zu viele Tage (${entries.length}, höchstens ${MAX_ENTRIES}).`,
    });
  }

  const seen = new Set<string>();
  for (const entry of entries) {
    const { date } = entry;
    if (!DATE_PATTERN.test(date) || !date.startsWith(`${month}-`)) {
      issues.push({ date, message: `Datum liegt nicht im Monat ${month}.` });
    }
    if (seen.has(date)) {
      issues.push({ date, message: "Datum kommt mehrfach vor." });
    }
    seen.add(date);
    if (!HOURS_PATTERN.test(entry.hours)) {
      issues.push({ date, message: `Ungültige Stunden „${entry.hours}“.` });
    }
    if (entry.text.length > MAX_TEXT_LENGTH) {
      issues.push({
        date,
        message: `Text hat ${entry.text.length} Zeichen (höchstens ${MAX_TEXT_LENGTH}).`,
      });
    }
  }

  const size = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (size > MAX_PAYLOAD_BYTES) {
    issues.push({
      message: "Der Stundenzettel ist zu groß für die Extension.",
    });
  }
  return issues;
}

export function ackErrorMessage(error: string | undefined): string {
  switch (error) {
    case "VALIDATION":
      return "Die Extension hat die Daten abgelehnt (Prüfung fehlgeschlagen).";
    case "TOO_LARGE":
      return "Die Daten sind für die Extension zu groß.";
    case "ORIGIN":
      return "Die Extension akzeptiert diese Adresse nicht. Prüfe die r-worktime-URL in den Extension-Optionen.";
    case "TIMEOUT":
      return "Die Extension hat nicht geantwortet.";
    default:
      return error
        ? `Senden fehlgeschlagen (${error}).`
        : "Senden fehlgeschlagen.";
  }
}
