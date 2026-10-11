// Beschriftungen und reine Helfer für Einstellungen › Kalender und den Hinweis
// im Abwesenheitsbericht.

import type { Tone } from "@/components/app/status-badge";
import { isAbsenceKind, KIND_LABELS } from "@/lib/absences/kinds";
import {
  CALENDAR_SYNC_STATUS_ERROR,
  type CalendarFeedTest,
  type CalendarSyncAction,
  type CalendarSyncActionType,
  type CalendarTimingProject,
  type PublicCalendarSettings,
} from "@/lib/calendar/types";
import { isDateKey } from "@/lib/dates";
import { formatDateShort, plural } from "@/lib/format";

/** Aktion als ganzer Satzteil für die Zeile im Protokoll */
export const ACTION_LABELS: Record<CalendarSyncActionType, string> = {
  created: "Angelegt",
  linked: "Mit vorhandenem Eintrag verknüpft",
  timingCreated: "In Timing eingetragen",
  timingAdopted: "Vorhandenen Timing-Eintrag übernommen",
  deleted: "Gelöscht",
  unlinked: "Verknüpfung gelöst",
  skippedUnknownType: "Unbekannter Typ übersprungen",
  failed: "Fehlgeschlagen",
};

/** Kurzform für Zählungen („2 angelegt · 1 in Timing eingetragen“) */
const ACTION_COUNT_LABELS: Record<CalendarSyncActionType, string> = {
  created: "angelegt",
  linked: "verknüpft",
  timingCreated: "in Timing eingetragen",
  timingAdopted: "aus Timing übernommen",
  deleted: "gelöscht",
  unlinked: "entkoppelt",
  skippedUnknownType: "übersprungen (unbekannter Typ)",
  failed: "fehlgeschlagen",
};

const ACTION_ORDER = Object.keys(ACTION_LABELS) as CalendarSyncActionType[];

function isKnownAction(action: string): action is CalendarSyncActionType {
  return action in ACTION_LABELS;
}

export function actionLabel(action: string): string {
  return isKnownAction(action) ? ACTION_LABELS[action] : action;
}

/** Ton je Aktion: Fehler rot, Übersprungenes gelb, Löschen neutral */
export function actionTone(action: string): Tone {
  if (action === "failed") return "negative";
  if (action === "skippedUnknownType") return "warning";
  if (action === "timingCreated" || action === "timingAdopted") return "info";
  return "neutral";
}

/** "2026-10-12" → „Mo 12.10.2026“; ohne gültiges Datum null */
export function formatActionDate(date: string | null): string | null {
  if (!date || !isDateKey(date)) return null;
  return `${formatDateShort(date)}${date.slice(0, 4)}`;
}

/** AbsenceKind → „Urlaub“; unbekannter Typtext bleibt, wie er ist */
export function kindLabel(kind: string | null): string | null {
  if (!kind) return null;
  return isAbsenceKind(kind) ? KIND_LABELS[kind] : kind;
}

/** Aktionen eines Laufs gezählt, z. B. „2 angelegt · 1 in Timing eingetragen“ */
export function summarizeActions(
  actions: readonly CalendarSyncAction[],
): string {
  const counts = new Map<string, number>();
  for (const { action } of actions) {
    counts.set(action, (counts.get(action) ?? 0) + 1);
  }
  const known = ACTION_ORDER.filter((action) => counts.has(action)).map(
    (action) => `${counts.get(action)} ${ACTION_COUNT_LABELS[action]}`,
  );
  const unknown = [...counts.entries()]
    .filter(([action]) => !isKnownAction(action))
    .map(([action, count]) => `${count} ${action}`);
  return [...known, ...unknown].join(" · ");
}

/** Aktionen chronologisch (stabil: gleiche Tage in Protokollreihenfolge) */
export function sortActions(
  actions: readonly CalendarSyncAction[],
): CalendarSyncAction[] {
  return [...actions].sort((a, b) => a.date.localeCompare(b.date));
}

/** Testabruf als Satz: „3 Abwesenheiten (1 storniert), 21 Events, 0 unbekannte Typen“ */
export function formatFeedTest(test: CalendarFeedTest): string {
  const absences = plural(test.absences, "Abwesenheit", "Abwesenheiten");
  const cancelled =
    test.cancelled > 0 ? ` (davon ${test.cancelled} storniert)` : "";
  const events = plural(test.events, "Event", "Events");
  const unknown = plural(
    test.unknownTypes.length,
    "unbekannter Typ",
    "unbekannte Typen",
  );
  return `${absences}${cancelled}, ${events}, ${unknown}`;
}

/** Gespeicherte Feed-URL: nur der Host plus „…“ */
export function maskedFeedUrl(feedHost: string | null): string {
  return feedHost ? `https://${feedHost}/…` : "https://…";
}

/** Vorschlag fürs Urlaubsprojekt: erstes Projekt mit „Urlaub“ im Pfad */
export function suggestVacationProject(
  projects: readonly CalendarTimingProject[],
): CalendarTimingProject | null {
  return (
    projects.find((project) => /urlaub/i.test(project.path.normalize("NFC"))) ??
    null
  );
}

export type CalendarSyncState =
  | "not-configured"
  | "running"
  | "failed"
  | "never"
  | "stale"
  | "ok";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function deriveCalendarSyncState(
  settings: PublicCalendarSettings | undefined,
  running: boolean,
  now: Date = new Date(),
): CalendarSyncState {
  if (!settings?.configured) return "not-configured";
  if (running) return "running";
  if (settings.lastSyncStatus === CALENDAR_SYNC_STATUS_ERROR) return "failed";
  if (!settings.lastSyncAt) return "never";
  if (now.getTime() - new Date(settings.lastSyncAt).getTime() > STALE_AFTER_MS)
    return "stale";
  return "ok";
}

export const CALENDAR_SYNC_STATE_LABEL: Record<CalendarSyncState, string> = {
  "not-configured": "Kein Feed hinterlegt",
  running: "Gleiche ab …",
  failed: "Abgleich fehlgeschlagen",
  never: "Noch nie abgeglichen",
  stale: "Abgleich veraltet",
  ok: "Abgleich aktuell",
};

export const CALENDAR_SYNC_STATE_TONE: Record<CalendarSyncState, Tone> = {
  "not-configured": "neutral",
  running: "info",
  failed: "negative",
  never: "warning",
  stale: "warning",
  ok: "positive",
};

/** Bekannte Zahlen aus lastSyncStats; die Form gehört dem Abgleich */
const STATS_LABELS: Record<string, string> = {
  absences: "Abwesenheiten im Feed",
  cancelled: "Storniert",
  events: "Events",
  unknownTypes: "Unbekannte Typen",
  ...ACTION_LABELS,
};

/**
 * Zahlen aus lastSyncStats als Zeilen: nur Schlüssel mit deutscher
 * Beschriftung, Zahlen und Listen (als Anzahl). Der Rest bleibt verborgen.
 */
export function statsRows(stats: unknown): Array<[string, number]> {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return [];
  const rows: Array<[string, number]> = [];
  for (const [key, value] of Object.entries(stats)) {
    const label = STATS_LABELS[key];
    if (!label) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      rows.push([label, value]);
    } else if (Array.isArray(value)) {
      rows.push([label, value.length]);
    }
  }
  return rows;
}
