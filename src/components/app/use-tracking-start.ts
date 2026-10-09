"use client";

import { useQuery } from "@tanstack/react-query";
import { dateKeyFromIsoTimestamp, shiftDateKey } from "@/lib/dates";
import { hoursToMinutes } from "@/lib/format";

interface AdjustmentResponse {
  adjustment: {
    id: string;
    date: string;
    hours: number;
    description: string | null;
  } | null;
}

export const TRACKING_START_KEY = ["tracking-start"] as const;

/** Anfangs-Saldo und Erfassungsbeginn (Tag nach dem Anfangs-Saldo). */
export function useTrackingStart(): {
  adjustmentDate: string | null;
  adjustmentMinutes: number | null;
  trackingStart: string | null;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: TRACKING_START_KEY,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const response = await fetch("/api/time-entries/adjustment");
      const body = (await response.json().catch(() => null)) as
        | (AdjustmentResponse & { error?: string })
        | null;
      if (!response.ok) {
        throw new Error(
          body?.error ?? "Anfangs-Saldo konnte nicht geladen werden",
        );
      }
      return body?.adjustment ?? null;
    },
  });

  const adjustment = query.data ?? null;
  let adjustmentDate: string | null = null;
  try {
    adjustmentDate = adjustment
      ? dateKeyFromIsoTimestamp(adjustment.date)
      : null;
  } catch {
    adjustmentDate = null;
  }

  return {
    adjustmentDate,
    adjustmentMinutes: adjustment ? hoursToMinutes(adjustment.hours) : null,
    trackingStart: adjustmentDate ? shiftDateKey(adjustmentDate, 1) : null,
    // Bei Fehler gilt „kein Erfassungsbeginn“, damit nichts ewig lädt
    isLoading: query.isLoading,
  };
}
