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
import { formatDuration, formatMonth, formatPercent } from "@/lib/format";
import type { BillingTrendPoint } from "@/lib/reports/billing";
import { shortMonthName } from "@/lib/reports/period";

interface ChartRow extends BillingTrendPoint {
  label: string;
  /** Quote in Prozent; null = keine Stunden (Lücke in der Linie) */
  percent: number | null;
  inPeriod: boolean;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay">
      <div className="mb-1 font-medium">{formatMonth(row.month)}</div>
      {row.totalMinutes === 0 ? (
        <div className="text-muted-foreground">Keine Arbeitszeit</div>
      ) : (
        <>
          <div className="num flex justify-between gap-4">
            <span className="text-muted-foreground">Quote</span>
            {formatPercent(row.billableShare)}
          </div>
          <div className="num flex justify-between gap-4">
            <span className="text-muted-foreground">Abrechenbar</span>
            {formatDuration(row.billableMinutes)}
          </div>
          <div className="num flex justify-between gap-4">
            <span className="text-muted-foreground">Nicht abrechenbar</span>
            {formatDuration(row.nonBillableMinutes)}
          </div>
          <div className="num flex justify-between gap-4">
            <span className="text-muted-foreground">Ohne Status</span>
            {formatDuration(row.unknownMinutes)}
          </div>
        </>
      )}
    </div>
  );
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
}

/** Punkte im gewählten Zeitraum gefüllt, sonst hohl. */
function renderDot(props: DotProps) {
  const { cx, cy, payload } = props;
  if (
    cx === undefined ||
    cy === undefined ||
    !payload ||
    payload.percent === null
  ) {
    return <g key={payload?.month ?? `${cx}-${cy}`} />;
  }
  return (
    <circle
      key={payload.month}
      cx={cx}
      cy={cy}
      r={payload.inPeriod ? 4 : 3}
      stroke="var(--chart-actual)"
      strokeWidth={2}
      fill={payload.inPeriod ? "var(--chart-actual)" : "var(--card)"}
    />
  );
}

/** Abrechenbar-Quote je Monat über 12 Monate. */
export function BillingTrendChart({
  points,
  periodMonths,
}: {
  points: BillingTrendPoint[];
  /** Monate "YYYY-MM" des gewählten Zeitraums (hervorgehoben) */
  periodMonths: string[];
}) {
  const months = new Set(periodMonths);
  const rows: ChartRow[] = points.map((point) => ({
    ...point,
    label: shortMonthName(point.month),
    percent:
      point.billableShare === null
        ? null
        : Math.round(point.billableShare * 1000) / 10,
    inPeriod: months.has(point.month),
  }));

  return (
    <div className="h-48 w-full min-w-0 md:h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{ top: 12, right: 12, bottom: 4, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={4}
            tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            width={44}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => `${value} %`}
            tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
          />
          <ReferenceLine y={100} stroke="var(--chart-grid)" />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }}
            content={<ChartTooltip />}
          />
          <Line
            type="linear"
            dataKey="percent"
            stroke="var(--chart-actual)"
            strokeWidth={2}
            dot={renderDot}
            activeDot={{ r: 5, fill: "var(--chart-actual)" }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
