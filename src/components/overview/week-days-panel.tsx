"use client";

import Link from "next/link";
import { Delta, Duration } from "@/components/app/duration";
import { ErrorState } from "@/components/app/error-state";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { SkeletonRows } from "@/components/app/skeletons";
import { RunningBadge } from "@/components/app/status-badge";
import { TargetBar } from "@/components/app/target-bar";
import { Button } from "@/components/ui/button";
import {
  currentIsoWeek,
  dayKeyOf,
  weekHref,
} from "@/components/week/week-utils";
import { useWeekData } from "@/hooks/use-week-data";
import { berlinTodayKey } from "@/lib/dates";
import { formatDateShort, hoursToMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROW =
  "grid h-11 grid-cols-[10ch_minmax(0,1fr)_6ch_7ch] items-center gap-3 px-4 text-[13px] leading-[18px]";

/** Tageszeilen der laufenden Woche mit Soll-Balken. */
export function WeekDaysPanel({ className }: { className?: string }) {
  const iso = currentIsoWeek();
  const href = weekHref(iso);
  const { data, isLoading, error, refetch } = useWeekData(iso.year, iso.week);
  const todayKey = berlinTodayKey();

  const days = (data?.data.days ?? []).map((day) => ({
    ...day,
    key: dayKeyOf(day.date),
    actual: hoursToMinutes(day.totalHours),
    target: hoursToMinutes(day.targetHours),
  }));
  const scale = Math.max(600, ...days.map((d) => d.actual));
  const workdays = days.filter((d) => !(d.isWeekend && d.entries.length === 0));
  const quietWeekend = days.filter(
    (d) => d.isWeekend && d.entries.length === 0,
  );

  return (
    <Panel className={className}>
      <PanelHeader
        title={`Diese Woche · KW ${iso.week}`}
        actions={
          <Button asChild variant="ghost" size="sm" className="-mr-2">
            <Link href={href}>Woche öffnen</Link>
          </Button>
        }
      />
      <PanelBody flush>
        {isLoading ? (
          <SkeletonRows count={6} height={44} />
        ) : error ? (
          <div className="p-4">
            <ErrorState
              title="Woche konnte nicht geladen werden"
              error={error}
              onRetry={() => refetch()}
            />
          </div>
        ) : (
          <ul className="divide-y">
            {workdays.map((day) => {
              const isToday = day.key === todayKey;
              const isFuture = day.key > todayKey;
              return (
                <li key={day.key}>
                  <Link
                    href={`${href}#${day.key}`}
                    className={cn(
                      ROW,
                      "transition-colors duration-[120ms] hover:bg-accent",
                      isToday && "font-medium",
                    )}
                  >
                    <span
                      className={cn(
                        "whitespace-nowrap",
                        isFuture && "text-muted-foreground",
                      )}
                    >
                      {formatDateShort(day.key)}
                    </span>
                    <TargetBar
                      actualMinutes={day.actual}
                      targetMinutes={day.target}
                      scaleMinutes={scale}
                      running={isToday}
                    />
                    <span className="text-right">
                      {isFuture && day.actual === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Duration minutes={day.actual} />
                      )}
                    </span>
                    <span className="flex justify-end">
                      {isToday ? (
                        <RunningBadge />
                      ) : isFuture ? (
                        <Delta minutes={null} />
                      ) : (
                        <Delta
                          minutes={day.actual - day.target}
                          noTarget={day.target === 0}
                        />
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
            {quietWeekend.length > 0 ? (
              <li
                className={cn(ROW, "text-muted-foreground")}
                title="Wochenende ohne Einträge"
              >
                <span>
                  {quietWeekend
                    .map((d) => formatDateShort(d.key).slice(0, 2))
                    .join(" · ")}
                </span>
                <span>—</span>
              </li>
            ) : null}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
