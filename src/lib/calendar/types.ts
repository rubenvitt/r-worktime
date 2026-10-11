// Öffentliche Typen des Kalender-Abgleichs (API-Antworten). Ohne Server-
// Abhängigkeiten, auch im Client nutzbar.

export const CALENDAR_SYNC_STATUS_SUCCESS = "success";
export const CALENDAR_SYNC_STATUS_ERROR = "error";
export type CalendarSyncStatus =
  | typeof CALENDAR_SYNC_STATUS_SUCCESS
  | typeof CALENDAR_SYNC_STATUS_ERROR;

/** Automatischer Abgleich: stündlich */
export const CALENDAR_SYNC_INTERVAL_MINUTES = 60;

/** Aufbewahrung der Protokolle je Nutzer */
export const CALENDAR_SYNC_LOG_KEEP = 50;

export type CalendarSyncActionType =
  /** Lokaler Eintrag angelegt (ohne Timing) */
  | "created"
  /** Vorhandener Eintrag (Timing-Sync, manuell) mit der Abwesenheit verknüpft */
  | "linked"
  /** In Timing angelegt und lokal gespeichert */
  | "timingCreated"
  /** Vorhandenen Timing-Eintrag übernommen und lokal gespeichert */
  | "timingAdopted"
  /** Eigener Eintrag gelöscht (lokal und ggf. in Timing) */
  | "deleted"
  /** Fremder Eintrag von der Abwesenheit gelöst */
  | "unlinked"
  /** Unbekannter Typ im Feed */
  | "skippedUnknownType"
  /** Fehlgeschlagen, der nächste Lauf versucht es erneut */
  | "failed";

export interface CalendarSyncAction {
  /** "YYYY-MM-DD" */
  date: string;
  /** Abwesenheitsart (AbsenceKind) bzw. bei unbekanntem Typ der Typtext */
  kind: string;
  action: CalendarSyncActionType;
  /** Erläuterung auf Deutsch */
  detail: string;
}

export interface CalendarSyncStats {
  trigger: "manual" | "scheduler";
  /** Feed: aktive und stornierte Abwesenheiten, Events, unbekannte Typen */
  absences: number;
  cancelled: number;
  events: number;
  unknownTypes: string[];
  /** Abwesenheiten (Absence-Zeilen) */
  absencesCreated: number;
  absencesUpdated: number;
  absencesCancelled: number;
  /** Tage */
  created: number;
  linked: number;
  timingCreated: number;
  timingAdopted: number;
  deleted: number;
  unlinked: number;
  failed: number;
  /** Warum keine Timing-Einträge geschrieben wurden; null = Timing aktiv oder abgeschaltet */
  timingSkippedReason: string | null;
  durationMs: number;
}

/** Antwort von POST /api/calendar/sync */
export interface CalendarSyncResult {
  status: CalendarSyncStatus;
  error?: string;
  stats: CalendarSyncStats;
  actions: CalendarSyncAction[];
}

/** Antwort von GET /api/calendar/settings */
export interface PublicCalendarSettings {
  configured: boolean;
  feedHost: string | null;
  syncEnabled: boolean;
  writeToTiming: boolean;
  timingProjectId: string | null;
  timingConnected: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncStats: CalendarSyncStats | null;
}

/** Body von PUT /api/calendar/settings; fehlende Felder bleiben unverändert */
export interface CalendarSettingsInput {
  /** null oder "" löscht die Feed-URL */
  feedUrl?: string | null;
  syncEnabled?: boolean;
  writeToTiming?: boolean;
  /** Timing-Referenz ("/projects/123"); null oder "" = keins */
  timingProjectId?: string | null;
}

/** Testabruf beim Speichern einer Feed-URL */
export interface CalendarFeedTest {
  absences: number;
  cancelled: number;
  events: number;
  unknownTypes: string[];
}

/** Antwort von PUT /api/calendar/settings; test nur bei neuer Feed-URL */
export interface CalendarSettingsSaveResponse {
  settings: PublicCalendarSettings;
  test?: CalendarFeedTest;
}

/** Eintrag von GET /api/calendar/logs */
export interface CalendarSyncLogEntry {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  error: string | null;
  actions: CalendarSyncAction[];
}

/** Eintrag von GET /api/calendar/timing-projects */
export interface CalendarTimingProject {
  /** Timing-Referenz ("/projects/123") */
  id: string;
  path: string;
}
