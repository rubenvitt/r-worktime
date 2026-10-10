"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDelta, formatDuration } from "@/lib/format";
import { niceTicks } from "./year-format";

export interface BalancePoint {
  key: string;
  /** Achsenbeschriftung, z. B. „Okt“ */
  label: string;
  /** Tooltip-Titel, z. B. „Oktober 2026 (bis heute)“ */
  title: string;
  /** Saldo am Ende des Zeitraums in Minuten; null = keine Daten */
  balance: number | null;
  /** Differenz im Zeitraum in Minuten */
  delta?: number;
  actual?: number;
  target?: number;
  /** Tooltip-Beschriftung für `actual`, Standard „Gearbeitet“ */
  actualLabel?: string;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: BalancePoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point || point.balance === null) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay">
      <div className="mb-1 font-medium">{point.title}</div>
      <div className="num flex justify-between gap-4">
        <span className="text-muted-foreground">Saldo</span>
        {formatDelta(point.balance)}
      </div>
      {point.delta !== undefined ? (
        <div className="num flex justify-between gap-4">
          <span className="text-muted-foreground">Differenz</span>
          {formatDelta(point.delta)}
        </div>
      ) : null}
      {point.actual !== undefined && point.target !== undefined ? (
        <div className="num flex justify-between gap-4">
          <span className="text-muted-foreground">
            {point.actualLabel ?? "Gearbeitet"}
          </span>
          {formatDuration(point.actual)} von {formatDuration(point.target)}
        </div>
      ) : null}
    </div>
  );
}

/** Saldo-Verlauf als Linie um die Nulllinie; `dashed` für Prognosen. */
export function BalanceChart({
  points,
  dashed,
  ariaLabel,
}: {
  points: BalancePoint[];
  dashed?: boolean;
  ariaLabel: string;
}) {
  const values = points
    .map((p) => p.balance)
    .filter((v): v is number => v !== null);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="h-44 w-full min-w-0 md:h-[220px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 12, right: 12, bottom: 4, left: 4 }}
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={8}
            tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
          />
          <YAxis
            domain={domain}
            width={52}
            tickLine={false}
            axisLine={false}
            ticks={ticks}
            interval={0}
            tickFormatter={(value: number) => formatDelta(value)}
            tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
          />
          <ReferenceLine y={0} stroke="var(--chart-axis)" />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }}
            content={<ChartTooltip />}
          />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="var(--chart-actual)"
            strokeWidth={2}
            strokeDasharray={dashed ? "6 4" : undefined}
            dot={{ r: 3, fill: "var(--chart-actual)", strokeWidth: 0 }}
            activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
