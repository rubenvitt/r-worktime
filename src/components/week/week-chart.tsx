"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateShort, formatHours } from "@/lib/format";
import type { DailyStatistics } from "@/types/statistics";
import { dayKeyOf } from "./week-utils";

interface ChartRow {
  key: string;
  name: string;
  actual: number;
  target: number;
}

interface TooltipPayload {
  payload?: ChartRow;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay">
      <div className="mb-1 font-medium">{formatDateShort(row.key)}</div>
      <div className="num flex justify-between gap-4">
        <span className="text-muted-foreground">Ist</span>
        {formatHours(row.actual)}
      </div>
      <div className="num flex justify-between gap-4">
        <span className="text-muted-foreground">Soll</span>
        {formatHours(row.target)}
      </div>
    </div>
  );
}

/** Ist/Soll je Tag aus /api/statistics/weekly. */
export function WeekChart({
  days,
  isLoading,
  error,
  onRetry,
}: {
  days: DailyStatistics[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (isLoading) return <Skeleton className="h-[260px] w-full" />;
  if (error) {
    return (
      <ErrorState
        title="Diagramm konnte nicht geladen werden"
        error={error}
        onRetry={onRetry}
      />
    );
  }
  if (!days || days.length === 0) {
    return <EmptyState title="Für diese Woche gibt es keine Tageswerte." />;
  }

  // Tage über das zurückgelieferte Datum zuordnen, nicht über eine eigene KW-Rechnung
  const rows: ChartRow[] = days.map((day) => {
    const key = dayKeyOf(day.date);
    return {
      key,
      name: formatDateShort(key).slice(0, 2),
      actual: day.actualHours,
      target: day.targetHours,
    };
  });

  return (
    <figure className="min-w-0">
      <div className="h-[260px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            barGap={-28}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
              tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
              tickFormatter={(value: number) => formatHours(value)}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={<ChartTooltip />}
            />
            <Bar
              dataKey="actual"
              name="Ist"
              fill="var(--chart-actual)"
              barSize={28}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="target"
              name="Soll"
              fill="transparent"
              stroke="var(--chart-axis)"
              strokeWidth={1}
              barSize={28}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-xs bg-chart-actual"
          />
          Ist
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-xs border border-chart-axis"
          />
          Soll
        </span>
      </figcaption>
    </figure>
  );
}
