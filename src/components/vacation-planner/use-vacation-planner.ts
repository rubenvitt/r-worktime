"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  VacationDraftDto,
  VacationPlannerResponse,
} from "@/lib/vacation-planner";

export const PLANNER_KEY = ["vacation-planner"] as const;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      body?.error ?? `Anfrage fehlgeschlagen (HTTP ${response.status})`,
    );
  }
  return body as T;
}

export function useVacationPlanner(year: number) {
  return useQuery({
    queryKey: [...PLANNER_KEY, year],
    queryFn: () =>
      request<VacationPlannerResponse>(`/api/vacation-planner?year=${year}`),
  });
}

export interface DraftInput {
  from: string;
  to: string;
  note?: string | null;
}

/** Entwürfe anlegen, ändern, löschen; danach den Planer neu laden. */
export function useDraftMutations() {
  const queryClient = useQueryClient();
  const onSettled = () =>
    queryClient.invalidateQueries({ queryKey: PLANNER_KEY });

  const create = useMutation({
    mutationFn: (input: DraftInput) =>
      request<VacationDraftDto>("/api/vacation-drafts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSettled,
  });
  const update = useMutation({
    mutationFn: ({ id, ...input }: Partial<DraftInput> & { id: string }) =>
      request<VacationDraftDto>(`/api/vacation-drafts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSettled,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      request<void>(`/api/vacation-drafts/${id}`, { method: "DELETE" }),
    onSettled,
  });
  return { create, update, remove };
}
