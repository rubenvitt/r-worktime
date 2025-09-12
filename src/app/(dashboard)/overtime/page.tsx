"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  Settings,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface OvertimeData {
  balance: number;
  details?: {
    actualHours: number;
    targetHours: number;
    overtimeHours: number;
  };
  lastUpdated: Date;
}

interface MonthlyData {
  month: string;
  year: number;
  actualHours: number;
  targetHours: number;
  overtimeHours: number;
}

interface OvertimeApiResponse {
  data: OvertimeData;
}

// API functions
const fetchTotalOvertime = async (): Promise<OvertimeData> => {
  const response = await fetch("/api/statistics/overtime?includeDetails=true");
  if (!response.ok) throw new Error("Failed to fetch total overtime");
  const result: OvertimeApiResponse = await response.json();
  return result.data;
};

const fetchYearlyOvertime = async (year: string): Promise<OvertimeData> => {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const response = await fetch(
    `/api/statistics/overtime?startDate=${startDate}&endDate=${endDate}&includeDetails=true`,
  );
  if (!response.ok) throw new Error("Failed to fetch yearly overtime");
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

  const _startDate = new Date(yearNum, monthNum, 1).toISOString().split("T")[0];
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
    throw new Error("Failed to fetch monthly overtime");
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

export default function OvertimePage() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth.toString());

  // Query hooks
  const { data: totalOvertime, isLoading: totalLoading } = useQuery({
    queryKey: ["overtime", "total"],
    queryFn: fetchTotalOvertime,
    staleTime: 60 * 1000, // 1 minute
  });

  const { data: yearlyOvertime, isLoading: yearlyLoading } = useQuery({
    queryKey: ["overtime", "yearly", selectedYear],
    queryFn: () => fetchYearlyOvertime(selectedYear),
    staleTime: 60 * 1000,
  });

  const { data: monthlyOvertime, isLoading: monthlyLoading } = useQuery({
    queryKey: ["overtime", "monthly", selectedYear, selectedMonth],
    queryFn: () => fetchMonthlyOvertime(selectedYear, selectedMonth),
    staleTime: 60 * 1000,
  });

  const { data: monthlyHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ["overtime", "history", selectedYear],
    queryFn: () => fetchMonthlyHistory(selectedYear),
    staleTime: 2 * 60 * 1000, // 2 minutes for history data
  });

  const formatHours = (hours: number) => {
    const absHours = Math.abs(hours);
    const wholeHours = Math.floor(absHours);
    const minutes = Math.round((absHours - wholeHours) * 60);
    const sign = hours < 0 ? "-" : "+";
    return `${sign}${wholeHours}h ${minutes}m`;
  };

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);
  const monthOptions = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ];

  const _isLoading =
    totalLoading || yearlyLoading || monthlyLoading || historyLoading;

  return (
    <div className="container max-w-7xl py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Überstunden-Übersicht</h1>
          <p className="text-muted-foreground">
            Detaillierte Analyse deiner Arbeitszeiten und Überstunden
          </p>
        </div>
        <Link href="/settings/overtime">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Einstellungen
          </Button>
        </Link>
      </div>

      {/* Main Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Total Overtime - Highlighted */}
        <Card className="border-2 border-primary bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium">
                Aktuelle Gesamt-Überstunden
              </CardTitle>
              <CardDescription className="text-xs">
                Dein aktueller Überstunden-Stand
              </CardDescription>
            </div>
            <Clock className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            {totalLoading ? (
              <div className="animate-pulse h-10 bg-gray-200 rounded w-32" />
            ) : totalOvertime ? (
              <>
                <div
                  className={cn(
                    "text-3xl font-bold",
                    totalOvertime.balance >= 0
                      ? "text-green-600"
                      : "text-red-600",
                  )}
                >
                  {formatHours(totalOvertime.balance)}
                </div>
                {totalOvertime.details && (
                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Gearbeitet:{" "}
                      <span className="font-medium">
                        {totalOvertime.details.actualHours.toFixed(1)}h
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Sollzeit:{" "}
                      <span className="font-medium">
                        {totalOvertime.details.targetHours.toFixed(1)}h
                      </span>
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Keine Daten</div>
            )}
          </CardContent>
        </Card>

        {/* Yearly Overtime */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedYear} Überstunden
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {yearlyLoading ? (
              <div className="animate-pulse h-8 bg-gray-200 rounded w-24" />
            ) : yearlyOvertime ? (
              <>
                <div
                  className={cn(
                    "text-2xl font-bold",
                    yearlyOvertime.balance >= 0
                      ? "text-green-600"
                      : "text-red-600",
                  )}
                >
                  {formatHours(yearlyOvertime.balance)}
                </div>
                {yearlyOvertime.details && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {yearlyOvertime.details.actualHours.toFixed(1)}h von{" "}
                    {yearlyOvertime.details.targetHours.toFixed(1)}h
                  </p>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Keine Daten</div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Overtime */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {monthOptions[parseInt(selectedMonth, 10)]} {selectedYear}
              {parseInt(selectedYear, 10) === currentYear &&
                parseInt(selectedMonth, 10) === currentMonth && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (bis heute)
                  </span>
                )}
            </CardTitle>
            {monthlyOvertime && monthlyOvertime.balance >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            {monthlyLoading ? (
              <div className="animate-pulse h-8 bg-gray-200 rounded w-24" />
            ) : monthlyOvertime ? (
              <>
                <div
                  className={cn(
                    "text-2xl font-bold",
                    monthlyOvertime.balance >= 0
                      ? "text-green-600"
                      : "text-red-600",
                  )}
                >
                  {formatHours(monthlyOvertime.balance)}
                </div>
                {monthlyOvertime.details && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {monthlyOvertime.details.actualHours.toFixed(1)}h von{" "}
                    {monthlyOvertime.details.targetHours.toFixed(1)}h
                  </p>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Keine Daten</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Time Selection */}
      <div className="flex gap-4 mb-6">
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((month, index) => (
              <SelectItem key={`month-${index}`} value={index.toString()}>
                {month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Monthly Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Monatsübersicht {selectedYear}</CardTitle>
          <CardDescription>
            Überstunden-Entwicklung über das Jahr
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="animate-pulse space-y-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={`skeleton-history-${i}`}
                  className="h-12 bg-gray-200 rounded"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {monthlyHistory.map((month, index) => {
                const monthIndex = new Date(month.year, 0).getMonth() + index;
                const isCurrentMonth =
                  monthIndex === currentMonth && month.year === currentYear;

                return (
                  <div
                    key={`${month.year}-${index}`}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-colors",
                      isCurrentMonth && "bg-primary/5 border-primary",
                      !isCurrentMonth && "border-transparent hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-24 font-medium">{month.month}</div>
                      <div className="text-sm text-muted-foreground">
                        Gearbeitet: {month.actualHours.toFixed(1)}h
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Soll: {month.targetHours.toFixed(1)}h
                      </div>
                    </div>
                    <div
                      className={cn(
                        "font-semibold",
                        month.overtimeHours >= 0
                          ? "text-green-600"
                          : "text-red-600",
                      )}
                    >
                      {formatHours(month.overtimeHours)}
                    </div>
                  </div>
                );
              })}
              {monthlyHistory.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Keine Daten für {selectedYear} verfügbar
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
