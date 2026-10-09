"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDelta, formatDuration } from "@/lib/format";

export interface DeltaPoint {
  key: string;
  /** Achsenbeschriftung, z. B. „Okt (bis heute)“ */
  label: string;
  /** Differenz in Minuten */
  delta: number;
  actual: number;
  target: number;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: DeltaPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay">
      <div className="mb-1 font-medium">{point.label}</div>
      <div className="num flex justify-between gap-4">
        <span className="text-muted-foreground">Differenz</span>
        {formatDelta(point.delta)}
      </div>
      <div className="num flex justify-between gap-4">
        <span className="text-muted-foreground">Gearbeitet</span>
        {formatDuration(point.actual)} von {formatDuration(point.target)}
      </div>
    </div>
  );
}

interface LabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
}

/** Wert am Balkenende: über positiven, unter negativen Balken. */
function renderValueLabel(props: LabelProps) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const value = typeof props.value === "number" ? props.value : null;
  if (value === null) return null;
  const top = Math.min(y, y + height);
  const bottom = Math.max(y, y + height);
  const below = value < 0;
  return (
    <text
      x={x + width / 2}
      y={below ? bottom + 14 : top - 6}
      textAnchor="middle"
      fill="var(--foreground)"
      fontSize={12}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {formatDelta(value)}
    </text>
  );
}

/** Divergierende Balken je Monat um die Nulllinie. */
export function MonthlyDeltaChart({ points }: { points: DeltaPoint[] }) {
  const max = Math.max(60, ...points.map((p) => Math.abs(p.delta)));
  // Platz für die Werte an den Balkenenden
  const domain: [number, number] = [
    points.some((p) => p.delta < 0) ? -max * 1.5 : 0,
    points.some((p) => p.delta > 0) ? max * 1.5 : 0,
  ];

  return (
    <div className="h-40 w-full min-w-0 md:h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={points}
          margin={{ top: 20, right: 8, bottom: 4, left: 8 }}
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
          />
          <YAxis hide domain={domain} />
          <ReferenceLine y={0} stroke="var(--chart-axis)" />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={<ChartTooltip />}
          />
          <Bar
            dataKey="delta"
            maxBarSize={48}
            radius={[3, 3, 3, 3]}
            isAnimationActive={false}
          >
            {points.map((point) => (
              <Cell
                key={point.key}
                fill={
                  point.delta < 0
                    ? "var(--negative)"
                    : point.delta > 0
                      ? "var(--positive)"
                      : "var(--chart-target)"
                }
              />
            ))}
            <LabelList dataKey="delta" content={renderValueLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
