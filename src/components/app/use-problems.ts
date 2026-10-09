"use client";

import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import type { ProblemTypeKey } from "@/lib/labels";

export interface ProblemsQuery {
  startDate: string;
  endDate: string;
  problemType?: "all" | "missing" | "zero_hours" | "incomplete";
  reviewStatus?: "unreviewed" | "reviewed" | "all";
  sortBy?: "date_asc" | "date_desc" | "type";
}

export interface ProblemDayDto {
  /** ISO-Zeitstempel (UTC-Mitternacht des Tags); Key per .slice(0, 10) */
  date: string;
  type: ProblemTypeKey;
  currentHours: number;
  expectedHours: number;
  entries: Array<{
    id: string;
    startTime?: string;
    endTime?: string;
    duration: number;
    type: string;
    description?: string;
  }>;
  isWeekend: boolean;
  isHoliday: boolean;
  suggestion: "review" | "add_entry" | "bulk_fill";
}

export interface ProblemsResponse {
  problems: ProblemDayDto[];
  stats: {
    totalProblems: number;
    missingDays: number;
    zeroHoursDays: number;
    incompleteDays: number;
  };
}

function normalize(q: ProblemsQuery) {
  return {
    startDate: q.startDate,
    endDate: q.endDate,
    problemType: q.problemType ?? "all",
    reviewStatus: q.reviewStatus ?? "unreviewed",
    sortBy: q.sortBy ?? "date_desc",
  } as const;
}

/** ["problems", normalisierte Abfrage] – Präfix ["problems"] für Invalidierung */
export function problemsQueryKey(q: ProblemsQuery): readonly unknown[] {
  return ["problems", normalize(q)] as const;
}

/** Offene Tage im Zeitraum. `q === null` deaktiviert die Abfrage. */
export function useProblems(
  q: ProblemsQuery | null,
  options?: { enabled?: boolean },
): UseQueryResult<ProblemsResponse> {
  return useQuery<ProblemsResponse>({
    queryKey: q ? problemsQueryKey(q) : ["problems", "disabled"],
    enabled: q !== null && (options?.enabled ?? true),
    queryFn: async () => {
      if (!q) throw new Error("Kein Zeitraum");
      const params = new URLSearchParams(normalize(q));
      const response = await fetch(`/api/problems?${params}`);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error ?? "Probleme konnten nicht geladen werden");
      }
      return body as ProblemsResponse;
    },
  });
}
