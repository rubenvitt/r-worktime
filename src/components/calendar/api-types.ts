// Client-Spiegel der Kalender-API (/api/calendar/*). Die Routen gehören zum
// Abgleich; hier stehen nur die Formen, die die Oberfläche liest und schickt.

export type CalendarSyncRunStatus = "success" | "error";

/** GET /api/calendar/settings */
export interface CalendarSettings {
  /** Feed-URL hinterlegt */
  configured: boolean;
  /** Host der Feed-URL, z. B. „timewarp.innoq.io“ – nie die ganze URL */
  feedHost: string | null;
  syncEnabled: boolean;
  writeToTiming: boolean;
  timingProjectId: string | null;
  /** Timing-API-Key hinterlegt */
  timingConnected: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: CalendarSyncRunStatus | string | null;
  lastSyncError: string | null;
  /** Form gehört dem Abgleich; die Oberfläche liest sie defensiv */
  lastSyncStats: unknown;
}

/** Body von PUT /api/calendar/settings */
export interface CalendarSettingsInput {
  feedUrl?: string | null;
  syncEnabled?: boolean;
  writeToTiming?: boolean;
  timingProjectId?: string | null;
}

/** Ergebnis des Testabrufs beim Speichern einer Feed-URL */
export interface CalendarFeedTest {
  absences: number;
  cancelled: number;
  events: number;
  unknownTypes: string[];
}

/** Antwort von PUT /api/calendar/settings */
export interface CalendarSettingsSaveResponse {
  settings: CalendarSettings;
  test?: CalendarFeedTest;
}

export const CALENDAR_SYNC_ACTIONS = [
  "created",
  "linked",
  "timingCreated",
  "timingAdopted",
  "deleted",
  "unlinked",
  "skippedUnknownType",
  "failed",
] as const;

export type CalendarSyncActionType = (typeof CALENDAR_SYNC_ACTIONS)[number];

/** Eine Aktion eines Laufs */
export interface CalendarSyncAction {
  /** "YYYY-MM-DD" */
  date: string | null;
  /** AbsenceKind oder, bei unbekannten Typen, der Typtext aus dem Feed */
  kind: string | null;
  action: CalendarSyncActionType | string;
  detail: string | null;
}

/** Antwort von POST /api/calendar/sync */
export interface CalendarSyncResult {
  status: CalendarSyncRunStatus;
  error?: string | null;
  stats: unknown;
  actions: CalendarSyncAction[];
}

/** Zeile von GET /api/calendar/logs */
export interface CalendarSyncLog {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: CalendarSyncRunStatus | string;
  error: string | null;
  actions: CalendarSyncAction[];
}

/** Zeile von GET /api/calendar/timing-projects */
export interface TimingProjectOption {
  id: string;
  /** z. B. „Work ▸ INNOQ ▸ Urlaub“ */
  path: string;
}
