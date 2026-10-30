"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateEntryDependentQueries } from "@/components/app/query-invalidation";
import type {
  PublicTimingSettings,
  PublicTimingStatus,
} from "@/lib/timing/settings";
import type { SyncStats } from "@/services/timing-sync.service";

export const TIMING_SETTINGS_KEY = ["timing", "settings"] as const;
export const TIMING_STATUS_KEY = ["timing", "status"] as const;

export type TimingSettingsInput = Partial<{
  apiToken: string | null;
  projectRoots: string[];
  syncEnabled: boolean;
  syncIntervalMinutes: number;
  syncWindowDays: number;
  writeHolidays: boolean;
  holidayProjectId: string | null;
  sickProjectId: string | null;
}>;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(
      body?.error ?? `Anfrage fehlgeschlagen (HTTP ${response.status})`,
    );
  }
  return body.data as T;
}

export function useTimingSettings() {
  return useQuery({
    queryKey: TIMING_SETTINGS_KEY,
    queryFn: () => request<PublicTimingSettings>("/api/timing/settings"),
  });
}

export function useTimingStatus() {
  return useQuery({
    queryKey: TIMING_STATUS_KEY,
    queryFn: () => request<PublicTimingStatus>("/api/timing/status"),
    // Während ein Sync läuft häufiger nachsehen
    refetchInterval: (query) => (query.state.data?.running ? 3_000 : 60_000),
  });
}

export function useSaveTimingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TimingSettingsInput) =>
      request<PublicTimingSettings>("/api/timing/settings", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(TIMING_SETTINGS_KEY, data);
      queryClient.invalidateQueries({ queryKey: TIMING_STATUS_KEY });
    },
  });
}

export function useTestTimingConnection() {
  return useMutation({
    mutationFn: (apiToken?: string) =>
      request<{ projectCount: number }>("/api/timing/test", {
        method: "POST",
        body: JSON.stringify(apiToken ? { apiToken } : {}),
      }),
  });
}

export function useRunTimingSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (range?: { from: string; to: string }) =>
      request<SyncStats>("/api/timing/sync", {
        method: "POST",
        body: JSON.stringify(range ?? {}),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TIMING_STATUS_KEY });
      // Zeiteinträge, Abwesenheiten und Salden haben sich womöglich geändert
      invalidateEntryDependentQueries(queryClient);
    },
  });
}
