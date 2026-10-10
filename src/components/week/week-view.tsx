"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Download,
  MoreHorizontal,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Delta, Duration } from "@/components/app/duration";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { PeriodNav } from "@/components/app/period-nav";
import { RefetchBar } from "@/components/app/skeletons";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import { currentWeekHref } from "@/components/layout/nav-config";
import { useTotalOvertime } from "@/components/overview/use-overtime";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useWeekData } from "@/hooks/use-week-data";
import { berlinTodayKey, shiftDateKey } from "@/lib/dates";
import {
  formatDateShort,
  formatHoursDelta,
  hoursToMinutes,
} from "@/lib/format";
import type {
  StatisticsApiResponse,
  WeeklyStatistics,
} from "@/types/statistics";
import { WeekChart } from "./week-chart";
import { WeekDayList } from "./week-day-list";
import {
  dayKeyOf,
  formatWeekRange,
  isoWeekMonday,
  shiftIsoWeek,
  weekHref,
} from "./week-utils";
import { WeekViewSkeleton } from "./week-view-skeleton";

interface WeekViewProps {
  year: number;
  week: number;
}

export function WeekView({ year, week }: WeekViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState("list");

  const { data, isLoading, isFetching, error, refetch } = useWeekData(
    year,
    week,
  );

  const weekly = useQuery<StatisticsApiResponse<WeeklyStatistics>>({
    queryKey: ["weekly-stats", year, week],
    queryFn: async () => {
      const response = await fetch(
        `/api/statistics/weekly?year=${year}&week=${week}`,
      );
      if (!response.ok)
        throw new Error("Wochenstatistik konnte nicht geladen werden");
      return response.json();
    },
    staleTime: 60 * 1000,
  });
  const weeklyData = weekly.data?.data;

  const total = useTotalOvertime();

  const todayKey = berlinTodayKey();
  const mondayKey = isoWeekMonday(year, week);
  const startKey = data ? dayKeyOf(data.data.weekStartDate) : mondayKey;
  const endKey = data
    ? dayKeyOf(data.data.weekEndDate)
    : shiftDateKey(mondayKey, 6);
  const isCurrent = weekHref({ year, week }) === currentWeekHref();
  const isFuture = startKey > todayKey;

  const go = (delta: number) =>
    router.push(weekHref(shiftIsoWeek(year, week, delta)));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["week-data"] });
    queryClient.invalidateQueries({ queryKey: ["weekly-stats", year, week] });
  };

  const exportToCSV = () => {
    if (!weeklyData?.dailyBreakdown) return;

    const csvContent = [
      [
        "Datum",
        "Tag",
        "Ist-Stunden",
        "Soll-Stunden",
        "Überstunden",
        "Typ",
      ].join(","),
      ...weeklyData.dailyBreakdown.map((day) =>
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
    link.download = `wochenstatistik-${mondayKey}.csv`;
    link.click();

    toast({
      title: "Export erfolgreich",
      description: "Die Wochenstatistik wurde als CSV exportiert.",
    });
  };

  const header = (
    <PageHeader
      title="Woche"
      period={
        <PeriodNav
          label={`KW ${week} · ${formatWeekRange(startKey, endKey)}`}
          shortLabel={`KW ${week}`}
          prevLabel="Vorherige Woche"
          nextLabel="Nächste Woche"
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onToday={() => router.push(currentWeekHref())}
          isCurrent={isCurrent}
        />
      }
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 md:size-8"
              aria-label="Weitere Aktionen"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!weeklyData}
              onSelect={() => exportToCSV()}
            >
              <Download />
              Als CSV exportieren
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => refresh()}>
              <RefreshCw />
              Aktualisieren
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <WeekViewSkeleton />
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        {header}
        <ErrorState
          title="Woche konnte nicht geladen werden"
          error={error}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  const { days, summary } = data.data;
  const workdays = days.filter((d) => d.targetHours > 0).length;
  const actualMinutes = hoursToMinutes(summary.totalWorkHours);
  const targetMinutes = hoursToMinutes(summary.targetHours);
  const hasEntries = days.some((d) => d.entries.length > 0);
  // Nicht importierte Feiertage an Soll-Tagen: zählen im Saldo noch als Soll
  const missingHolidays = days.filter(
    (d) => d.holiday && !d.holiday.imported && d.targetHours > 0,
  );

  return (
    <>
      {header}
      <div className="space-y-6">
        <StatStrip>
          <Stat
            label="Gearbeitet"
            value={<Duration minutes={actualMinutes} />}
          />
          <Stat label="Soll" value={<Duration minutes={targetMinutes} />} />
          <Stat
            label="Woche"
            value={
              <Delta
                minutes={isFuture ? null : actualMinutes - targetMinutes}
              />
            }
            hint={isCurrent ? "bis heute, Soll ganze Woche" : undefined}
          />
          <Stat
            label="Ø pro Arbeitstag"
            value={
              workdays > 0 && !isFuture ? (
                <Duration minutes={Math.round(actualMinutes / workdays)} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            }
            hint={`${workdays} ${workdays === 1 ? "Arbeitstag" : "Arbeitstage"}`}
          />
        </StatStrip>

        {missingHolidays.length > 0 ? (
          <p className="flex gap-2 text-[13px] text-muted-foreground">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-warning"
            />
            <span>
              {missingHolidays
                .map(
                  (d) =>
                    `${d.holiday?.name} (${formatDateShort(dayKeyOf(d.date))})`,
                )
                .join(", ")}{" "}
              {missingHolidays.length === 1 ? "ist" : "sind"} nicht importiert
              und {missingHolidays.length === 1 ? "zählt" : "zählen"} deshalb im
              Soll wie im Saldo.{" "}
              <Link href="/settings/overtime" className="underline">
                Feiertage importieren
              </Link>
            </span>
          </p>
        ) : null}

        <Tabs value={tab} onValueChange={setTab} className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <TabsList>
              <TabsTrigger value="list" className="px-3">
                Liste
              </TabsTrigger>
              <TabsTrigger value="chart" className="px-3">
                Diagramm
              </TabsTrigger>
            </TabsList>
            {total.data ? (
              <Link
                href="/overtime"
                className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Saldo{" "}
                <span className="num text-foreground">
                  {formatHoursDelta(total.data.balance)}
                </span>{" "}
                · Überstunden
              </Link>
            ) : null}
          </div>
          <RefetchBar active={isFetching && !isLoading} />

          <TabsContent value="list">
            {hasEntries ? (
              <WeekDayList
                days={days}
                todayKey={todayKey}
                onChanged={refresh}
              />
            ) : (
              <Panel>
                <EmptyState
                  title={
                    isFuture
                      ? `Für KW ${week} gibt es noch keine Einträge.`
                      : `Keine Einträge in KW ${week}.`
                  }
                />
              </Panel>
            )}
          </TabsContent>
          <TabsContent value="chart">
            <Panel className="p-4">
              <WeekChart
                days={weeklyData?.dailyBreakdown}
                isLoading={weekly.isLoading}
                error={weekly.error}
                onRetry={() => weekly.refetch()}
              />
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
