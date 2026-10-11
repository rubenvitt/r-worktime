"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateEntryDependentQueries } from "@/components/app/query-invalidation";
import type {
  CalendarSettings,
  CalendarSettingsInput,
  CalendarSettingsSaveResponse,
  CalendarSyncLog,
  CalendarSyncResult,
  TimingProjectOption,
} from "./api-types";

export const CALENDAR_KEYS = {
  all: ["calendar"] as const,
  settings: ["calendar", "settings"] as const,
  logs: (limit: number) => ["calendar", "logs", limit] as const,
  timingProjects: ["calendar", "timing-projects"] as const,
};

export const CALENDAR_LOG_LIMIT = 20;

/** Fehler einer Kalender-Route mit HTTP-Status (409 = Lauf aktiv bzw. Timing fehlt) */
export class CalendarApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CalendarApiError";
  }
}

export function isConflict(error: unknown): boolean {
  return error instanceof CalendarApiError && error.status === 409;
}

/**
 * Einziger Abruf der Kalender-Routen: JSON wie vereinbart, Fehler als
 * `{error}`. Liefert eine Route doch die Hülle `{success, data}` wie die
 * Timing-Routen, wird sie hier ausgepackt.
 */
async function calendarRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body: unknown = await response.json().catch(() => null);
  const envelope =
    body && typeof body === "object" && "success" in body
      ? (body as { success: unknown; data?: unknown; error?: unknown })
      : null;
  if (!response.ok || envelope?.success === false) {
    const error =
      body && typeof body === "object" && "error" in body
        ? (body as { error: unknown }).error
        : null;
    throw new CalendarApiError(
      typeof error === "string" && error
        ? error
        : `Anfrage fehlgeschlagen (HTTP ${response.status})`,
      response.status,
    );
  }
  return (envelope ? envelope.data : body) as T;
}

export function useCalendarSettings(options: { quiet?: boolean } = {}) {
  return useQuery({
    queryKey: CALENDAR_KEYS.settings,
    queryFn: () => calendarRequest<CalendarSettings>("/api/calendar/settings"),
    // Im Bericht nur ein Hinweis: nicht wiederholen, Fehler still schlucken
    retry: options.quiet ? false : undefined,
  });
}

export function useSaveCalendarSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarSettingsInput) =>
      calendarRequest<CalendarSettingsSaveResponse>("/api/calendar/settings", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(CALENDAR_KEYS.settings, data.settings);
    },
  });
}

export function useCalendarLogs(limit = CALENDAR_LOG_LIMIT) {
  return useQuery({
    queryKey: CALENDAR_KEYS.logs(limit),
    queryFn: () =>
      calendarRequest<CalendarSyncLog[]>(`/api/calendar/logs?limit=${limit}`),
  });
}

/**
 * Timing-Projekte für die Auswahl. Ohne Timing-Token antwortet die Route mit
 * 409 – das ist „nicht verbunden“, kein Fehler: Ergebnis null.
 */
export function useTimingProjects(enabled: boolean) {
  return useQuery({
    queryKey: CALENDAR_KEYS.timingProjects,
    queryFn: async () => {
      try {
        return await calendarRequest<TimingProjectOption[]>(
          "/api/calendar/timing-projects",
        );
      } catch (error) {
        if (isConflict(error)) return null;
        throw error;
      }
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useRunCalendarSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      calendarRequest<CalendarSyncResult>("/api/calendar/sync", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CALENDAR_KEYS.all });
      // Einträge, Abwesenheiten und Salden haben sich womöglich geändert
      invalidateEntryDependentQueries(queryClient);
    },
  });
}
