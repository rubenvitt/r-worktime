"use client";

// Brücke zur Odoo-Extension nach Protokoll v1 (window.postMessage ↔ Content Script).

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimesheetEntry } from "@/lib/timesheet/aggregate";
import {
  ABSENCE_FEATURE,
  type AbsenceMessagePayload,
  ACK_TIMEOUT_MS,
  type ExtensionMessage,
  extensionFeatures,
  PAGE_SOURCE,
  type PageMessage,
  PING_TIMEOUT_MS,
  PROTOCOL_VERSION,
  parseExtensionMessage,
} from "@/lib/timesheet/extension-protocol";

export type OdooExtensionStatus = "unknown" | "present" | "absent";

export type OdooSendResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

interface PendingAck {
  resolve: (result: OdooSendResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function post(message: PageMessage) {
  // nie "*": nur an den eigenen Origin
  window.postMessage(message, window.location.origin);
}

export function useOdooExtension() {
  const [status, setStatus] = useState<OdooExtensionStatus>("unknown");
  const [version, setVersion] = useState<string | null>(null);
  const [features, setFeatures] = useState<string[]>([]);
  const pending = useRef(new Map<string, PendingAck>());
  const pingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ping = useCallback(() => {
    if (pingTimer.current) clearTimeout(pingTimer.current);
    post({
      source: PAGE_SOURCE,
      type: "RWT_PING",
      requestId: createRequestId(),
      protocol: PROTOCOL_VERSION,
    });
    pingTimer.current = setTimeout(() => {
      pingTimer.current = null;
      setStatus((current) => (current === "present" ? current : "absent"));
    }, PING_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    const acks = pending.current;

    const handleMessage = (event: MessageEvent) => {
      const message: ExtensionMessage | null = parseExtensionMessage(event, {
        window,
        origin: window.location.origin,
      });
      if (!message) return;

      if (message.type === "RWT_PONG" || message.type === "RWT_READY") {
        // auch ein verspätetes PONG/READY zählt
        setStatus("present");
        if (message.version) setVersion(message.version);
        setFeatures(extensionFeatures(message));
        return;
      }

      const entry = acks.get(message.requestId);
      if (!entry) return;
      clearTimeout(entry.timer);
      acks.delete(message.requestId);
      entry.resolve(
        message.ok
          ? { ok: true, count: message.count ?? 0 }
          : { ok: false, error: message.error ?? "UNKNOWN" },
      );
    };

    window.addEventListener("message", handleMessage);
    ping();

    return () => {
      window.removeEventListener("message", handleMessage);
      if (pingTimer.current) {
        clearTimeout(pingTimer.current);
        pingTimer.current = null;
      }
      for (const [id, entry] of acks) {
        clearTimeout(entry.timer);
        entry.resolve({ ok: false, error: "ABORTED" });
        acks.delete(id);
      }
    };
  }, [ping]);

  /** Schickt eine Nachricht und wartet auf das ACK mit derselben requestId. */
  const request = useCallback(
    (build: (requestId: string) => PageMessage): Promise<OdooSendResult> => {
      const requestId = createRequestId();
      return new Promise<OdooSendResult>((resolve) => {
        const timer = setTimeout(() => {
          pending.current.delete(requestId);
          resolve({ ok: false, error: "TIMEOUT" });
        }, ACK_TIMEOUT_MS);
        pending.current.set(requestId, { resolve, timer });
        post(build(requestId));
      });
    },
    [],
  );

  /** Schickt einen Monat an die Extension und wartet auf das ACK. */
  const send = useCallback(
    (month: string, entries: TimesheetEntry[]): Promise<OdooSendResult> =>
      request((requestId) => ({
        source: PAGE_SOURCE,
        type: "RWT_TIMESHEET",
        requestId,
        protocol: PROTOCOL_VERSION,
        payload: {
          month,
          generatedAt: new Date().toISOString(),
          entries: entries.map(({ date, hours, text, travelFee }) => ({
            date,
            hours,
            text,
            travelFee,
          })),
        },
      })),
    [request],
  );

  /** Schickt eine geplante Abwesenheit für Timewarp an die Extension. */
  const sendAbsence = useCallback(
    (payload: AbsenceMessagePayload): Promise<OdooSendResult> =>
      request((requestId) => ({
        source: PAGE_SOURCE,
        type: "RWT_ABSENCE",
        requestId,
        protocol: PROTOCOL_VERSION,
        payload,
      })),
    [request],
  );

  return {
    status,
    version,
    send,
    sendAbsence,
    /** Extension kann Abwesenheiten nach Timewarp übernehmen */
    supportsAbsence: status === "present" && features.includes(ABSENCE_FEATURE),
    recheck: ping,
  };
}
