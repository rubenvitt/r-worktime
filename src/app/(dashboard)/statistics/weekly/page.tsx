"use client";

import { useQuery } from "@tanstack/react-query";
import {
  addWeeks,
  endOfWeek,
  format,
  getWeek,
  getYear,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { de } from "date-fns/locale";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import type {
  StatisticsApiResponse,
  WeeklyStatistics,
} from "@/types/statistics";

export default function WeeklyStatisticsPage() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const { toast } = useToast();

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const year = getYear(currentWeek);
  const week = getWeek(currentWeek, { weekStartsOn: 1 });

  // Fetch weekly statistics
  const {
    data: apiResponse,
    isLoading,
    error,
    refetch,
  } = useQuery<StatisticsApiResponse<WeeklyStatistics>>({
    queryKey: ["weekly-stats", year, week],
    queryFn: async () => {
      const response = await fetch(
        `/api/statistics/weekly?year=${year}&week=${week}`,
      );
      if (!response.ok) throw new Error("Failed to fetch weekly statistics");
      return response.json();
    },
    staleTime: 60 * 1000, // 1 minute
  });

  const data = apiResponse?.data;

  const navigateWeek = (direction: "prev" | "next") => {
    setCurrentWeek((prev) =>
      direction === "prev" ? subWeeks(prev, 1) : addWeeks(prev, 1),
    );
  };

  const goToCurrentWeek = () => {
    setCurrentWeek(new Date());
  };

  const exportToCSV = () => {
    if (!data?.dailyBreakdown) return;

    const csvContent = [
      [
        "Datum",
        "Tag",
        "Ist-Stunden",
        "Soll-Stunden",
        "Überstunden",
        "Typ",
      ].join(","),
      ...data.dailyBreakdown.map((day) =>
        [
          format(new Date(day.date), "yyyy-MM-dd"),
          format(new Date(day.date), "EEEE", { locale: de }),
          day.actualHours.toFixed(2),
          day.targetHours.toFixed(2),
          day.overtimeHours.toFixed(2),
          day.entryType,
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `wochenstatistik-${format(weekStart, "yyyy-MM-dd")}.csv`;
    link.click();

    toast({
      title: "Export erfolgreich",
      description: "Die Wochenstatistik wurde als CSV exportiert.",
    });
  };

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, "0")}`;
  };

  const chartData =
    data?.dailyBreakdown.map((day) => ({
      name: format(new Date(day.date), "EEEEEE", { locale: de }), // Short day name
      Gearbeitet: Number(day.actualHours.toFixed(2)),
      Sollzeit: Number(day.targetHours.toFixed(2)),
      Überstunden: Number(day.overtimeHours.toFixed(2)),
    })) || [];

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Wochenstatistiken
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Detaillierte Übersicht für{" "}
          {format(weekStart, "dd.MM.", { locale: de })} -{" "}
          {format(weekEnd, "dd.MM.yyyy", { locale: de })}
        </p>
      </div>

      {/* Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateWeek("prev")}
          >
            <ChevronLeft className="h-4 w-4" />
            Vorherige Woche
          </Button>
          <Button variant="outline" size="sm" onClick={goToCurrentWeek}>
            <Calendar className="h-4 w-4 mr-2" />
            Diese Woche
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateWeek("next")}
          >
            Nächste Woche
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            disabled={!data}
          >
            <Download className="h-4 w-4 mr-2" />
            CSV Export
          </Button>
        </div>
      </div>

      {error ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-red-600 mb-4">Fehler beim Laden der Daten</p>
              <Button onClick={() => refetch()}>Erneut versuchen</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Gesamtstunden
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoading ? (
                    <div className="h-6 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    formatHours(data?.totalHours || 0)
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Diese Woche gearbeitet
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Sollstunden
                </CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoading ? (
                    <div className="h-6 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    formatHours(data?.targetHours || 0)
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Geplante Arbeitszeit
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Überstunden
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    (data?.overtimeHours || 0) >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {isLoading ? (
                    <div className="h-6 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    formatHours(data?.overtimeHours || 0)
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Differenz zur Sollzeit
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ø Täglich</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoading ? (
                    <div className="h-6 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    formatHours(data ? data.totalHours / 7 : 0)
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Durchschnitt pro Tag
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Tägliche Arbeitszeiten</CardTitle>
              <CardDescription>
                Vergleich zwischen gearbeiteten Stunden und Sollzeit
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-64 bg-gray-200 rounded animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => [formatHours(value), ""]}
                      labelStyle={{ color: "#374151" }}
                    />
                    <Bar dataKey="Sollzeit" fill="#e5e7eb" />
                    <Bar dataKey="Gearbeitet" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Daily Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle>Tägliche Aufschlüsselung</CardTitle>
              <CardDescription>
                Detaillierte Übersicht für jeden Tag
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tag</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead className="text-right">Gearbeitet</TableHead>
                      <TableHead className="text-right">Sollzeit</TableHead>
                      <TableHead className="text-right">Überstunden</TableHead>
                      <TableHead className="text-right">Typ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 7 }).map((_, i) => (
                        <TableRow key={`weekly-skeleton-row-${i}`}>
                          {Array.from({ length: 6 }).map((_, j) => (
                            <TableCell key={`weekly-skeleton-cell-${j}`}>
                              <div className="h-4 bg-gray-200 rounded animate-pulse" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : data?.dailyBreakdown.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-4">
                          Keine Daten für diese Woche verfügbar
                        </TableCell>
                      </TableRow>
                    ) : (
                      data?.dailyBreakdown.map((day) => (
                        <TableRow key={day.date.toString()}>
                          <TableCell className="font-medium">
                            {format(new Date(day.date), "EEEE", { locale: de })}
                          </TableCell>
                          <TableCell>
                            {format(new Date(day.date), "dd.MM.yyyy", {
                              locale: de,
                            })}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatHours(day.actualHours)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatHours(day.targetHours)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium ${
                              day.overtimeHours >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {day.overtimeHours >= 0 ? "+" : ""}
                            {formatHours(day.overtimeHours)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              {day.entryType}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
