"use client";

import { ChevronRight } from "lucide-react";
import { Delta, Duration } from "@/components/app/duration";
import { TargetBar } from "@/components/app/target-bar";
import { hoursToMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { groupMonths } from "./overtime-utils";
import type { MonthlyData } from "./use-overtime";

const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 md:grid-cols-[minmax(9rem,1fr)_8ch_8ch_9ch_minmax(6rem,12rem)]";

function MonthLine({
  month,
  scale,
  isCurrent,
}: {
  month: MonthlyData;
  scale: number;
  isCurrent: boolean;
}) {
  const actual = hoursToMinutes(month.actualHours);
  const target = hoursToMinutes(month.targetHours);
  const noTarget = target === 0;
  const hint = isCurrent ? "Soll ganzer Monat" : noTarget ? "kein Soll" : null;

  return (
    <li
      className={cn(
        GRID,
        "py-2 text-[13px] leading-[18px] md:min-h-11 md:py-1.5",
        isCurrent && "bg-accent/50",
      )}
      aria-current={isCurrent ? "date" : undefined}
    >
      <span className="min-w-0">
        <span className="font-medium">{month.month}</span>
        {hint ? (
          <span className="ml-2 text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
      {/* Mobil: Differenz oben rechts, „Gearbeitet von Soll“ darunter */}
      <span className="text-right md:hidden">
        <Delta minutes={actual - target} noTarget={noTarget} />
      </span>
      <span className="col-span-2 flex items-center gap-3 text-muted-foreground md:hidden">
        <span className="num whitespace-nowrap">
          <Duration minutes={actual} className="text-foreground" /> von{" "}
          <Duration minutes={target} />
        </span>
        <TargetBar
          className="flex-1"
          actualMinutes={actual}
          targetMinutes={target}
          scaleMinutes={scale}
        />
      </span>
      <span className="hidden text-right md:block">
        <Duration minutes={actual} />
      </span>
      <span className="hidden text-right text-muted-foreground md:block">
        <Duration minutes={target} />
      </span>
      <span className="hidden text-right md:block">
        <Delta minutes={actual - target} noTarget={noTarget} />
      </span>
      <TargetBar
        className="hidden md:flex"
        actualMinutes={actual}
        targetMinutes={target}
        scaleMinutes={scale}
      />
    </li>
  );
}

/** Monatstabelle eines Jahres; Monate vor Erfassungsbeginn eingeklappt. */
export function OvertimeMonths({
  months,
  year,
  trackingStart,
  currentYear,
  currentMonthIndex,
}: {
  months: MonthlyData[];
  year: number;
  trackingStart: string | null;
  currentYear: number;
  currentMonthIndex: number;
}) {
  const rows = groupMonths(months, year, trackingStart);
  const scale = Math.max(
    1,
    ...months.map((m) =>
      Math.max(hoursToMinutes(m.actualHours), hoursToMinutes(m.targetHours)),
    ),
  );
  const isCurrent = (m: MonthlyData) =>
    year === currentYear && m.monthIndex === currentMonthIndex;

  return (
    <div>
      <div
        aria-hidden="true"
        className={cn(
          GRID,
          "hidden h-8 border-b text-xs text-muted-foreground md:grid",
        )}
      >
        <span>Monat</span>
        <span className="text-right">Gearbeitet</span>
        <span className="text-right">Soll</span>
        <span className="text-right">Differenz</span>
        <span />
      </div>
      <ul className="divide-y">
        {rows.map((row) =>
          row.kind === "month" ? (
            <MonthLine
              key={row.month.monthIndex}
              month={row.month}
              scale={scale}
              isCurrent={isCurrent(row.month)}
            />
          ) : (
            <li key={`collapsed-${row.label}`}>
              <details className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[13px] leading-[18px] text-muted-foreground transition-colors duration-[120ms] hover:bg-accent [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform duration-[160ms] group-open:rotate-90"
                  />
                  <span>
                    <span className="text-foreground">{row.label}</span> · vor
                    Erfassungsbeginn
                  </span>
                </summary>
                <ul className="divide-y border-t">
                  {row.months.map((month) => (
                    <MonthLine
                      key={month.monthIndex}
                      month={month}
                      scale={scale}
                      isCurrent={false}
                    />
                  ))}
                </ul>
              </details>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
