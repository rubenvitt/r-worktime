// Wertet den Timewarp-Kalenderfeed (ICS) aus. Rein, ohne DB und Netz.
// Regeln: docs/superpowers/specs/2026-10-11-timewarp-absences-design.md, „Feed auswerten“.

import ICAL from "ical.js";
import { type AbsenceKind, parseTimewarpType } from "@/lib/absences/kinds";
import { isDateKey, shiftDateKey } from "@/lib/dates";

/** Eine Abwesenheit aus dem Feed. */
export interface ParsedAbsence {
  uid: string;
  sequence: number | null;
  kind: AbsenceKind;
  /** Typtext nach dem Namen, ohne „(halber Tag)“, z. B. „RESTURLAUB“ */
  rawType: string;
  /** "YYYY-MM-DD", beide inklusive */
  startDate: string;
  endDate: string;
  halfDay: boolean;
  cancelled: boolean;
}

/** Eintrag mit unbekanntem Typ (wird übersprungen und protokolliert). */
export interface UnknownTypeEntry {
  uid: string;
  rawType: string;
  startDate: string;
}

export interface TimewarpFeedResult {
  absences: ParsedAbsence[];
  /** Timewarp-Events („Event in Köln“), werden nicht übernommen */
  events: number;
  unknown: UnknownTypeEntry[];
  /** Unbekannte Typtexte, ohne Duplikate */
  unknownTypes: string[];
  /** VEVENTs ohne UID, nicht ganztägig oder mit kaputtem Datum */
  skipped: number;
  /** Alle VEVENTs im Feed (für die Prüfung auf einen leeren Feed) */
  totalEvents: number;
}

export class TimewarpParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimewarpParseError";
  }
}

const HALF_DAY_SUFFIX = /\(\s*halber\s+tag\s*\)\s*$/i;

/** Typtext aus SUMMARY: alles nach dem ersten ": ", Suffix „(halber Tag)“ getrennt. */
export function splitSummary(summary: string): {
  rawType: string;
  halfDay: boolean;
} {
  const separator = summary.indexOf(": ");
  const afterName =
    separator >= 0 ? summary.slice(separator + 2) : summary.trim();
  const halfDay = HALF_DAY_SUFFIX.test(afterName);
  const rawType = afterName.replace(HALF_DAY_SUFFIX, "").trim();
  return { rawType, halfDay };
}

function isEventType(rawType: string): boolean {
  return /^event\b/i.test(rawType.trim());
}

type IcalTime = InstanceType<typeof ICAL.Time>;

function asTime(value: unknown): IcalTime | null {
  return value instanceof ICAL.Time ? value : null;
}

function dateKeyOf(time: IcalTime): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)}`;
}

function stringProp(vevent: InstanceType<typeof ICAL.Component>, name: string) {
  const value = vevent.getFirstPropertyValue(name);
  return typeof value === "string" ? value : null;
}

/**
 * Parst den Feed. Nur ganztägige VEVENTs zählen; Ende exklusiv
 * (DTEND − 1 Tag), bei DTEND ≤ DTSTART oder ohne DTEND gilt ein Tag.
 * Kommt eine UID mehrfach vor, gewinnt die höchste SEQUENCE.
 * METHOD im Kalenderkopf wird ignoriert, nur STATUS:CANCELLED storniert.
 */
export function parseTimewarpFeed(ics: string): TimewarpFeedResult {
  let root: InstanceType<typeof ICAL.Component>;
  try {
    root = new ICAL.Component(ICAL.parse(ics));
  } catch {
    throw new TimewarpParseError(
      "Der Kalender-Feed ist kein gültiges iCalendar.",
    );
  }
  if (root.name !== "vcalendar") {
    throw new TimewarpParseError(
      "Der Kalender-Feed ist kein gültiges iCalendar.",
    );
  }

  const byUid = new Map<string, ParsedAbsence>();
  const unknown: UnknownTypeEntry[] = [];
  let events = 0;
  let skipped = 0;
  const vevents = root.getAllSubcomponents("vevent");

  for (const vevent of vevents) {
    const uid = stringProp(vevent, "uid")?.trim();
    const start = asTime(vevent.getFirstPropertyValue("dtstart"));
    if (!uid || !start?.isDate) {
      skipped++;
      continue;
    }
    const startDate = dateKeyOf(start);
    if (!isDateKey(startDate)) {
      skipped++;
      continue;
    }
    const end = asTime(vevent.getFirstPropertyValue("dtend"));
    let endDate = startDate;
    if (end) {
      const endKey = dateKeyOf(end);
      if (!isDateKey(endKey)) {
        skipped++;
        continue;
      }
      if (endKey > startDate) endDate = shiftDateKey(endKey, -1);
    }

    const { rawType, halfDay } = splitSummary(
      stringProp(vevent, "summary") ?? "",
    );
    if (isEventType(rawType)) {
      events++;
      continue;
    }
    const kind = parseTimewarpType(rawType);
    if (!kind) {
      unknown.push({ uid, rawType, startDate });
      continue;
    }

    const rawSequence = vevent.getFirstPropertyValue("sequence");
    const sequence =
      typeof rawSequence === "number" && Number.isInteger(rawSequence)
        ? rawSequence
        : null;
    const parsed: ParsedAbsence = {
      uid,
      sequence,
      kind,
      rawType,
      startDate,
      endDate,
      halfDay,
      cancelled:
        stringProp(vevent, "status")?.trim().toUpperCase() === "CANCELLED",
    };
    const previous = byUid.get(uid);
    if (!previous || (previous.sequence ?? -1) <= (sequence ?? -1)) {
      byUid.set(uid, parsed);
    }
  }

  return {
    absences: Array.from(byUid.values()).sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) || a.uid.localeCompare(b.uid),
    ),
    events,
    unknown,
    unknownTypes: Array.from(new Set(unknown.map((entry) => entry.rawType))),
    skipped,
    totalEvents: vevents.length,
  };
}

/** Zusammenfassung für den Testabruf in den Einstellungen. */
export function summarizeFeed(result: TimewarpFeedResult): {
  absences: number;
  cancelled: number;
  events: number;
  unknownTypes: string[];
} {
  const cancelled = result.absences.filter((a) => a.cancelled).length;
  return {
    absences: result.absences.length - cancelled,
    cancelled,
    events: result.events,
    unknownTypes: result.unknownTypes,
  };
}
