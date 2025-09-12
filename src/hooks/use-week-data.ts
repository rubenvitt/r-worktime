import { useQuery } from "@tanstack/react-query";
import type { WeekDataResponse } from "@/types/statistics";

async function fetchWeekData(
  year: number,
  week: number,
): Promise<WeekDataResponse> {
  const response = await fetch(`/api/time-entries/week/${year}/${week}`);

  if (!response.ok) {
    throw new Error("Failed to fetch week data");
  }

  return response.json();
}

export function useWeekData(year: number, week: number) {
  return useQuery({
    queryKey: ["week-data", year, week],
    queryFn: () => fetchWeekData(year, week),
    staleTime: 5 * 60 * 1000, // 5 Minuten
    gcTime: 10 * 60 * 1000, // 10 Minuten (früher cacheTime)
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
