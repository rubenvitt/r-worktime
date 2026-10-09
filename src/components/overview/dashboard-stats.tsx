"use client";

import type * as React from "react";
import { Duration } from "@/components/app/duration";
import { currentMonth } from "@/components/app/month";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import { RunningBadge } from "@/components/app/status-badge";
import { TargetBar } from "@/components/app/target-bar";
import { useTrackingStart } from "@/components/app/use-tracking-start";
import { deltaTone, saldoContext } from "@/components/overview/saldo-context";
import {
  useMonthlyOvertime,
  useTotalOvertime,
} from "@/components/overview/use-overtime";
import { Skeleton } from "@/components/ui/skeleton";
import {
  currentIsoWeek,
  dayKeyOf,
  weekHref,
} from "@/components/week/week-utils";
import { useWeekData } from "@/hooks/use-week-data";
import { berlinTodayKey } from "@/lib/dates";
import { formatHoursDelta, formatMonth, hoursToMinutes } from "@/lib/format";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Konnte nicht geladen werden";
}

function Failed({ error }: { error: unknown }) {
  return (
    <span className="text-muted-foreground" title={errorText(error)}>
      —
    </span>
  );
}

function Loading({ wide }: { wide?: boolean }) {
  return (
    <Skeleton
      className={wide ? "my-1 h-7 w-28" : "my-1 h-5 w-24"}
      aria-label="Wird geladen"
    />
  );
}

function ActualOfTarget({
  actual,
  target,
}: {
  actual: number;
  target: number;
}): React.JSX.Element {
  return (
    <span className="whitespace-nowrap">
      <Duration minutes={actual} />
      <span className="text-base font-normal text-muted-foreground">
        {" / "}
        <Duration minutes={target} />
      </span>
    </span>
  );
}

/** Kennzahlen der Übersicht: Saldo, Diese Woche, Heute, laufender Monat. */
export function DashboardStats() {
  const total = useTotalOvertime();
  const { adjustmentDate, isLoading: trackingLoading } = useTrackingStart();

  const now = new Date();
  const month = useMonthlyOvertime(now.getFullYear(), now.getMonth());
  const monthName = formatMonth(currentMonth()).split(" ")[0];

  const iso = currentIsoWeek();
  const week = useWeekData(iso.year, iso.week);
  const todayKey = berlinTodayKey();
  const days = week.data?.data.days ?? [];
  const today = days.find((d) => dayKeyOf(d.date) === todayKey);
  const summary = week.data?.data.summary;

  const saldoMinutes =
    total.data !== undefined ? hoursToMinutes(total.data.balance) : null;
  const monthMinutes =
    month.data !== undefined && month.data !== null
      ? hoursToMinutes(month.data.balance)
      : null;

  return (
    <StatStrip>
      <Stat
        label="Saldo"
        emphasis
        href="/overtime"
        tone={saldoMinutes !== null ? deltaTone(saldoMinutes) : "neutral"}
        value={
          total.isLoading ? (
            <Loading wide />
          ) : total.isError ? (
            <Failed error={total.error} />
          ) : (
            formatHoursDelta(total.data?.balance ?? null)
          )
        }
        hint={trackingLoading ? undefined : saldoContext(adjustmentDate)}
      />
      <Stat
        label="Diese Woche"
        href={weekHref(iso)}
        value={
          week.isLoading ? (
            <Loading />
          ) : week.isError || !summary ? (
            <Failed error={week.error} />
          ) : (
            <ActualOfTarget
              actual={hoursToMinutes(summary.totalWorkHours)}
              target={hoursToMinutes(summary.targetHours)}
            />
          )
        }
        hint={
          summary ? (
            <TargetBar
              className="mt-2"
              actualMinutes={hoursToMinutes(summary.totalWorkHours)}
              targetMinutes={hoursToMinutes(summary.targetHours)}
              scaleMinutes={Math.max(
                hoursToMinutes(summary.targetHours),
                hoursToMinutes(summary.totalWorkHours),
              )}
            />
          ) : undefined
        }
      />
      <Stat
        label="Heute"
        value={
          week.isLoading ? (
            <Loading />
          ) : week.isError || !today ? (
            <Failed error={week.error} />
          ) : (
            <ActualOfTarget
              actual={hoursToMinutes(today.totalHours)}
              target={hoursToMinutes(today.targetHours)}
            />
          )
        }
        hint={today ? <RunningBadge /> : undefined}
      />
      <Stat
        label={monthName}
        tone={monthMinutes !== null ? deltaTone(monthMinutes) : "neutral"}
        value={
          month.isLoading ? (
            <Loading />
          ) : month.isError || monthMinutes === null ? (
            <Failed error={month.error} />
          ) : (
            formatHoursDelta(month.data?.balance ?? null)
          )
        }
        hint="bis heute"
      />
    </StatStrip>
  );
}
