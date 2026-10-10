"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatClock,
  type HistogramBucket,
  histogramTicks,
} from "@/lib/reports/patterns";

interface ChartRow extends HistogramBucket {
  label: string;
}

function ChartTooltip({
  active,
  payload,
  bucketMinutes,
  noun,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
  bucketMinutes: number;
  noun: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay">
      <div className="num mb-1 font-medium">
        {formatClock(row.minute)}–{formatClock(row.minute + bucketMinutes - 1)}
      </div>
      <div className="num">
        {row.count} {row.count === 1 ? "Tag" : "Tage"} {noun}
      </div>
    </div>
  );
}

/** Verteilung von Beginn oder Ende in festen Schritten (eine Reihe, keine Legende). */
export function DistributionChart({
  buckets,
  bucketMinutes,
  medianMinute,
  noun,
}: {
  buckets: HistogramBucket[];
  bucketMinutes: number;
  /** Median als Referenzlinie */
  medianMinute: number | null;
  /** „begonnen“ / „beendet“ für den Tooltip */
  noun: string;
}) {
  const rows: ChartRow[] = buckets.map((bucket) => ({
    ...bucket,
    label: formatClock(bucket.minute).replace(" (+1)", "⁺¹"),
  }));
  // Nur volle Stunden beschriften; der letzte Bucket bekommt kein Extra-Label
  const tickMinutes = new Set(histogramTicks(buckets));
  const ticks = rows
    .filter((row) => tickMinutes.has(row.minute))
    .map((row) => row.label);
  const medianBucket =
    medianMinute === null
      ? null
      : rows.find(
          (row) =>
            medianMinute >= row.minute &&
            medianMinute < row.minute + bucketMinutes,
        );

  return (
    <div className="h-[200px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          barCategoryGap={2}
          margin={{ top: 16, right: 4, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
            ticks={ticks}
            interval={0}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={28}
            allowDecimals={false}
            tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={<ChartTooltip bucketMinutes={bucketMinutes} noun={noun} />}
          />
          {medianBucket ? (
            <ReferenceLine
              x={medianBucket.label}
              stroke="var(--chart-axis)"
              strokeDasharray="3 3"
              label={{
                value: "Median",
                position: "top",
                fill: "var(--chart-axis)",
                fontSize: 11,
              }}
            />
          ) : null}
          <Bar
            dataKey="count"
            fill="var(--chart-actual)"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
