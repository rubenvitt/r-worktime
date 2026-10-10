"use client";

// Reisetag-Festlegungen speichern (PUT/DELETE /api/travel-days) und die alten
// localStorage-Korrekturen einmalig in die Datenbank übernehmen.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  applyDecisionToReport,
  resolveTravel,
  type TravelReport,
} from "@/lib/reports/travel";
import { parseLegacyTravelStorage } from "@/lib/timesheet/travel-legacy";
import type { TimesheetResponse } from "@/lib/timesheet/types";

export interface TravelDecisionInput {
  date: string;
  /** null = Festlegung entfernen, es gilt wieder der Vorschlag */
  isTravel: boolean | null;
}

async function saveTravelDecision({ date, isTravel }: TravelDecisionInput) {
  const response =
    isTravel === null
      ? await fetch(`/api/travel-days?date=${encodeURIComponent(date)}`, {
          method: "DELETE",
        })
      : await fetch("/api/travel-days", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, isTravel }),
        });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? "Reisetag konnte nicht gespeichert werden");
  }
  return body;
}

function isTimesheetResponse(value: unknown): value is TimesheetResponse {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as TimesheetResponse).days) &&
    Array.isArray((value as TimesheetResponse).payload)
  );
}

/** Setzt die Festlegung eines Tages in einer gecachten Stundenzettel-Antwort. */
export function applyTravelDecision(
  data: TimesheetResponse,
  { date, isTravel }: TravelDecisionInput,
): TimesheetResponse {
  const day = data.days.find((d) => d.date === date);
  if (!day) return data;
  const effective = resolveTravel(day.travelFee, isTravel).isTravel;
  return {
    ...data,
    days: data.days.map((d) =>
      d.date === date ? { ...d, travelOverride: isTravel } : d,
    ),
    payload: data.payload.map((p) =>
      p.date === date ? { ...p, travelFee: effective } : p,
    ),
  };
}

export const TRAVEL_DECISION_KEY = ["travel-decision"];

/**
 * Speichert eine Festlegung. Stundenzettel- und Berichts-Caches werden sofort angepasst
 * (optimistisch) und bei einem Fehler zurückgesetzt.
 */
export function useTravelDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: TRAVEL_DECISION_KEY,
    mutationFn: saveTravelDecision,
    onMutate: async (input: TravelDecisionInput) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["timesheet"] }),
        queryClient.cancelQueries({ queryKey: ["travel-report"] }),
      ]);
      const snapshot = [
        ...queryClient.getQueriesData<unknown>({ queryKey: ["timesheet"] }),
        ...queryClient.getQueriesData<unknown>({
          queryKey: ["travel-report"],
        }),
      ];
      queryClient.setQueriesData<unknown>(
        { queryKey: ["timesheet"] },
        (old: unknown) =>
          isTimesheetResponse(old) ? applyTravelDecision(old, input) : old,
      );
      queryClient.setQueriesData<TravelReport>(
        { queryKey: ["travel-report"] },
        (old: TravelReport | undefined) =>
          old ? applyDecisionToReport(old, input) : old,
      );
      return { snapshot };
    },
    onError: (error, _input, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
      toast.error(
        error instanceof Error
          ? error.message
          : "Reisetag konnte nicht gespeichert werden",
      );
    },
    onSettled: () => {
      // erst nach der letzten laufenden Änderung neu laden, sonst überschreibt
      // eine ältere Antwort den optimistischen Stand eines schnellen Umschaltens
      if (queryClient.isMutating({ mutationKey: TRAVEL_DECISION_KEY }) > 1) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["timesheet"] });
      queryClient.invalidateQueries({ queryKey: ["travel-report"] });
      queryClient.invalidateQueries({ queryKey: ["travel-days"] });
    },
  });
}

let legacyImportStarted = false;

/** Nur für Tests: erlaubt einen erneuten Import im selben Modul. */
export function resetLegacyTravelImport() {
  legacyImportStarted = false;
}

function readLegacyStorage(): [string, string | null][] {
  const items: [string, string | null][] = [];
  const storage = window.localStorage;
  // erst alle Schlüssel sammeln, dann lesen – Entfernen verschiebt die Indizes
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }
  for (const key of keys) items.push([key, storage.getItem(key)]);
  return items;
}

/**
 * Einmalige Übernahme der früheren localStorage-Korrekturen
 * (rwt.timesheet.travel.<Monat>). Der Server legt nur Tage ohne Festlegung
 * an; die Schlüssel verschwinden erst nach erfolgreicher Übernahme.
 */
export function useLegacyTravelImport() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (legacyImportStarted) return;
    legacyImportStarted = true;

    let legacy: ReturnType<typeof parseLegacyTravelStorage>;
    try {
      legacy = parseLegacyTravelStorage(readLegacyStorage());
    } catch {
      return; // Speicher nicht verfügbar
    }
    if (legacy.keys.length === 0) return;

    const removeKeys = () => {
      try {
        for (const key of legacy.keys) window.localStorage.removeItem(key);
      } catch {
        // nicht schlimm: der nächste Import überschreibt nichts
      }
    };

    if (legacy.decisions.length === 0) {
      removeKeys();
      return;
    }

    (async () => {
      try {
        const response = await fetch("/api/travel-days/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisions: legacy.decisions }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        removeKeys();
        queryClient.invalidateQueries({ queryKey: ["timesheet"] });
        queryClient.invalidateQueries({ queryKey: ["travel-report"] });
        queryClient.invalidateQueries({ queryKey: ["travel-days"] });
      } catch (error) {
        // beim nächsten Laden erneut versuchen
        legacyImportStarted = false;
        console.warn("Reisetage aus dem Browser nicht übernommen:", error);
      }
    })();
  }, [queryClient]);
}
