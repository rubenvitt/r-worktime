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
import { formatDuration, formatMonth } from "@/lib/format";
import type { ProjectTrend, TrendSeries } from "@/lib/reports/projects";
import { cn } from "@/lib/utils";

// Kategoriale Reihenfarben in fester Reihenfolge (hell/dunkel getrennt
// gewählt, farbfehlsichtigkeitsgeprüft). Status-Tokens wie --positive/
// --negative bleiben Salden vorbehalten.
const SERIES_VARS =
  "[--s1:#2a78d6] [--s2:#eb6834] [--s3:#1baf7a] [--s4:#eda100] [--s5:#e87ba4] [--s6:#008300] [--s7:#6250d6] " +
  "dark:[--s1:#3987e5] dark:[--s2:#d95926] dark:[--s3:#199e70] dark:[--s4:#c98500] dark:[--s5:#d55181] dark:[--s6:#008300] dark:[--s7:#9085e9]";

/** Farbe folgt der Reihe: Projekte Slot 1–6, „Ohne Projekt“ Slot 7, „Übrige“ grau. */
export function seriesColor(series: TrendSeries, index: number): string {
  if (series.kind === "other") return "var(--chart-target)";
  if (series.kind === "unassigned") return "var(--s7)";
  return `var(--s${Math.min(index + 1, 6)})`;
}

const shortMonthFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  month: "short",
});

/** "2026-10" → "Okt", Januar mit Jahr: "Jan 26" */
function shortMonth(month: string): string {
  const name = shortMonthFormatter
    .format(new Date(`${month}-01T12:00:00Z`))
    .replace(".", "");
  return month.endsWith("-01") ? `${name} ${month.slice(2, 4)}` : name;
}

type ChartRow = { month: string; label: string; total: number } & Record<
  string,
  number | string
>;

function ChartTooltip({
  active,
  payload,
  series,
  colors,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
  series: TrendSeries[];
  colors: Map<string, string>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  // Oben im Stapel = oben im Tooltip
  const visible = [...series]
    .reverse()
    .filter((s) => Number(row[s.id] ?? 0) > 0);
  return (
    <div className="min-w-48 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay">
      <div className="mb-1 font-medium">{formatMonth(row.month)}</div>
      {visible.length === 0 ? (
        <div className="text-muted-foreground">Keine Arbeitszeit</div>
      ) : (
        visible.map((s) => (
          <div key={s.id} className="num flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: colors.get(s.id) }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {s.label}
            </span>
            {formatDuration(Number(row[s.id]))}
          </div>
        ))
      )}
      <div className="num mt-1 flex justify-between gap-4 border-t pt-1 font-medium">
        <span>Gesamt</span>
        {formatDuration(row.total)}
      </div>
    </div>
  );
}

/** Gestapelte Monatsbalken der Top-Projekte, darunter Legende und Tabelle. */
export function ProjectTrendChart({ trend }: { trend: ProjectTrend }) {
  const colors = new Map(trend.series.map((s, i) => [s.id, seriesColor(s, i)]));
  const data: ChartRow[] = trend.rows.map((row) => ({
    month: row.month,
    label: shortMonth(row.month),
    total: row.total,
    ...row.values,
  }));
  const maxTotal = Math.max(...trend.rows.map((r) => r.total), 60);
  // Achse in vollen Stunden, Schritt passend zur Größenordnung
  const stepHours = maxTotal / 60 > 120 ? 50 : maxTotal / 60 > 40 ? 20 : 10;
  const top = Math.ceil(maxTotal / 60 / stepHours) * stepHours * 60;
  const ticks = Array.from(
    { length: top / (stepHours * 60) + 1 },
    (_, i) => i * stepHours * 60,
  );

  return (
    <div className={cn("space-y-3", SERIES_VARS)}>
      <div className="h-56 w-full min-w-0 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
            />
            <YAxis
              width={44}
              domain={[0, top]}
              ticks={ticks}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => `${Math.round(value / 60)} h`}
              tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={<ChartTooltip series={trend.series} colors={colors} />}
            />
            {trend.series.map((s) => (
              <Bar
                key={s.id}
                dataKey={s.id}
                name={s.label}
                stackId="projects"
                fill={colors.get(s.id)}
                stroke="var(--card)"
                strokeWidth={1}
                maxBarSize={40}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {trend.series.map((s) => (
          <li key={s.id} className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: colors.get(s.id) }}
            />
            <span className="max-w-[16rem] truncate">{s.label}</span>
            <span className="num text-muted-foreground">
              {formatDuration(s.totalMinutes)}
            </span>
          </li>
        ))}
      </ul>

      <details className="group text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-[13px] text-muted-foreground hover:text-foreground md:min-h-0">
          Als Tabelle anzeigen
        </summary>
        <div className="mt-2 overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  Monat
                </th>
                {trend.series.map((s) => (
                  <th
                    key={s.id}
                    scope="col"
                    className="whitespace-nowrap px-3 py-2 text-right font-medium"
                  >
                    {s.label}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Gesamt
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {trend.rows.map((row) => (
                <tr key={row.month}>
                  <th
                    scope="row"
                    className="whitespace-nowrap px-3 py-1.5 text-left font-normal"
                  >
                    {formatMonth(row.month)}
                  </th>
                  {trend.series.map((s) => (
                    <td key={s.id} className="num px-3 py-1.5 text-right">
                      {row.values[s.id]
                        ? formatDuration(row.values[s.id])
                        : "—"}
                    </td>
                  ))}
                  <td className="num px-3 py-1.5 text-right font-medium">
                    {formatDuration(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
