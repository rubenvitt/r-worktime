"use client";

// Überstunden-Abfragen für Übersicht und /overtime. Die Rechnung ist
// unverändert aus der bisherigen Überstundenseite übernommen; beide Seiten
// teilen sich dieselben Query-Keys und zeigen dadurch dieselben Zahlen.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { overtimeEvents } from "@/components/dashboard/overtime-card";

export interface OvertimeData {
  balance: number;
  details?: {
    actualHours: number;
    targetHours: number;
    overtimeHours: number;
  };
  lastUpdated: Date;
}

export interface MonthlyData {
  month: string;
  /** Monatsindex 0–11 */
  monthIndex: number;
  year: number;
  actualHours: number;
  targetHours: number;
  overtimeHours: number;
}

interface OvertimeApiResponse {
  data: OvertimeData;
}

const fetchTotalOvertime = async (): Promise<OvertimeData> => {
  const response = await fetch("/api/statistics/overtime?includeDetails=true");
  if (!response.ok) throw new Error("Saldo konnte nicht geladen werden");
  const result: OvertimeApiResponse = await response.json();
  return result.data;
};

const fetchYearlyOvertime = async (year: string): Promise<OvertimeData> => {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const response = await fetch(
    `/api/statistics/overtime?startDate=${startDate}&endDate=${endDate}&includeDetails=true`,
  );
  if (!response.ok) throw new Error("Jahreswerte konnten nicht geladen werden");
  const result: OvertimeApiResponse = await response.json();
  return result.data;
};

const fetchMonthlyOvertime = async (
  year: string,
  month: string,
): Promise<OvertimeData | null> => {
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const today = new Date();
  const isCurrentMonth =
    yearNum === today.getFullYear() && monthNum === today.getMonth();
  const isFutureMonth =
    yearNum > today.getFullYear() ||
    (yearNum === today.getFullYear() && monthNum > today.getMonth());

  if (isFutureMonth) return null;

  const endDate = isCurrentMonth
    ? today.toISOString().split("T")[0]
    : new Date(yearNum, monthNum + 1, 0).toISOString().split("T")[0];

  // Get cumulative data up to end date
  const cumulativeResponse = await fetch(
    `/api/statistics/overtime?startDate=${year}-01-01&endDate=${endDate}&includeDetails=true`,
  );

  // Get cumulative data up to previous month (if not January)
  let previousData = null;
  if (monthNum > 0) {
    const prevEndDate = new Date(yearNum, monthNum, 0)
      .toISOString()
      .split("T")[0];
    const prevResponse = await fetch(
      `/api/statistics/overtime?startDate=${year}-01-01&endDate=${prevEndDate}&includeDetails=true`,
    );
    if (prevResponse.ok) {
      const prevResult: OvertimeApiResponse = await prevResponse.json();
      previousData = prevResult.data;
    }
  }

  if (!cumulativeResponse.ok)
    throw new Error("Monatswert konnte nicht geladen werden");
  const cumulativeResult: OvertimeApiResponse = await cumulativeResponse.json();
  const cumulativeData = cumulativeResult.data;

  if (cumulativeData?.details) {
    const monthActual = previousData?.details
      ? cumulativeData.details.actualHours - previousData.details.actualHours
      : cumulativeData.details.actualHours;
    const monthTarget = previousData?.details
      ? cumulativeData.details.targetHours - previousData.details.targetHours
      : cumulativeData.details.targetHours;
    const monthOvertime = monthActual - monthTarget;

    return {
      balance: monthOvertime,
      details: {
        actualHours: monthActual,
        targetHours: monthTarget,
        overtimeHours: monthOvertime,
      },
      lastUpdated: cumulativeData.lastUpdated,
    };
  }

  return null;
};

const fetchMonthlyHistory = async (year: string): Promise<MonthlyData[]> => {
  const yearNum = parseInt(year, 10);
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const history: MonthlyData[] = [];
  let cumulativeActual = 0;
  let cumulativeTarget = 0;

  for (let month = 0; month <= 11; month++) {
    // Skip future months
    if (yearNum === currentYear && month > currentMonth) break;
    if (yearNum > currentYear) break;

    const endDate = new Date(yearNum, month + 1, 0).toISOString().split("T")[0];

    // Get cumulative data up to end of this month
    const response = await fetch(
      `/api/statistics/overtime?startDate=${year}-01-01&endDate=${endDate}&includeDetails=true`,
    );

    if (response.ok) {
      const result: OvertimeApiResponse = await response.json();
      if (
        result.data?.details &&
        (result.data.details.actualHours > 0 ||
          result.data.details.targetHours > 0)
      ) {
        // Calculate difference from previous month for monthly values
        const monthActual = result.data.details.actualHours - cumulativeActual;
        const monthTarget = result.data.details.targetHours - cumulativeTarget;
        const monthOvertime = monthActual - monthTarget;

        history.push({
          month: new Date(yearNum, month).toLocaleDateString("de-DE", {
            month: "long",
          }),
          monthIndex: month,
          year: yearNum,
          actualHours: monthActual,
          targetHours: monthTarget,
          overtimeHours: monthOvertime,
        });

        // Update cumulative values for next month
        cumulativeActual = result.data.details.actualHours;
        cumulativeTarget = result.data.details.targetHours;
      }
    }
  }

  return history;
};

/** Hält die Überstunden-Abfragen nach einem Datei-Import aktuell. */
function useOvertimeInvalidation() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unsubscribe = overtimeEvents.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["overtime"] });
    });
    return () => {
      unsubscribe();
    };
  }, [queryClient]);
}

/** Saldo inkl. Anfangs-Saldo (wie bisher die Karte „Überstunden Gesamt“). */
export function useTotalOvertime() {
  useOvertimeInvalidation();
  return useQuery({
    queryKey: ["overtime", "total"],
    queryFn: fetchTotalOvertime,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useYearlyOvertime(year: number) {
  return useQuery({
    queryKey: ["overtime", "yearly", String(year)],
    queryFn: () => fetchYearlyOvertime(String(year)),
    staleTime: 60 * 1000,
  });
}

/** Monat bis heute; `monthIndex` 0–11. */
export function useMonthlyOvertime(year: number, monthIndex: number) {
  return useQuery({
    queryKey: ["overtime", "monthly", String(year), String(monthIndex)],
    queryFn: () => fetchMonthlyOvertime(String(year), String(monthIndex)),
    staleTime: 60 * 1000,
  });
}

export function useMonthlyHistory(year: number) {
  return useQuery({
    queryKey: ["overtime", "history", String(year)],
    queryFn: () => fetchMonthlyHistory(String(year)),
    staleTime: 2 * 60 * 1000,
  });
}
