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
import { formatMonth } from "@/lib/format";
import { ABSENCE_CATEGORIES, type AbsenceMonth } from "@/lib/reports/absences";
import {
  CATEGORY_COLOR,
  formatDays,
  formatHoursLabel,
  PLANNED_OPACITY,
} from "./absence-style";

interface ChartRow {
  month: string;
  label: string;
  vacationTaken: number;
  vacationPlanned: number;
  special: number;
  overtimeReduction: number;
  sick: number;
  holiday: number;
  unpaid: number;
  source: AbsenceMonth;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

function TooltipLine({
  color,
  opacity = 1,
  label,
  days,
  hours,
}: {
  color: string;
  opacity?: number;
  label: string;
  days: number;
  hours?: number;
}) {
  if (days === 0 && !hours) return null;
  return (
    <div className="num flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-2.5 rounded-xs"
          style={{ background: color, opacity }}
        />
        {label}
      </span>
      <span>
        {formatDays(days)}
        {hours ? (
          <span className="text-muted-foreground">
            {" "}
            · {formatHoursLabel(hours)}
          </span>
        ) : null}
      </span>
    </div>
  );
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
  const { source } = row;
  const total = ABSENCE_CATEGORIES.reduce(
    (sum, category) => sum + source.days[category],
    0,
  );
  return (
    <div className="min-w-48 space-y-0.5 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay">
      <div className="mb-1 font-medium">{formatMonth(row.month)}</div>
      {total === 0 ? (
        <div className="text-muted-foreground">Keine Abwesenheit</div>
      ) : null}
      <TooltipLine
        color={CATEGORY_COLOR.vacation}
        label="Urlaub"
        days={row.vacationTaken}
      />
      <TooltipLine
        color={CATEGORY_COLOR.vacation}
        opacity={PLANNED_OPACITY}
        label="Urlaub geplant"
        days={row.vacationPlanned}
      />
      {source.days.vacation > 0 ? (
        <div className="num flex justify-between gap-4 text-muted-foreground">
          <span>Urlaub erfasst</span>
          {formatHoursLabel(source.hours.vacation)}
        </div>
      ) : null}
      <TooltipLine
        color={CATEGORY_COLOR.specialLeave}
        label="Sonderurlaub"
        days={source.days.specialLeave}
        hours={source.hours.specialLeave}
      />
      <TooltipLine
        color={CATEGORY_COLOR.educationalLeave}
        label="Bildungsurlaub"
        days={source.days.educationalLeave}
        hours={source.hours.educationalLeave}
      />
      <TooltipLine
        color={CATEGORY_COLOR.overtimeReduction}
        label="Überstundenabbau"
        days={source.days.overtimeReduction}
        hours={source.hours.overtimeReduction}
      />
      <TooltipLine
        color={CATEGORY_COLOR.sick}
        label="Krankheit"
        days={source.days.sick}
        hours={source.hours.sick}
      />
      <TooltipLine
        color={CATEGORY_COLOR.holiday}
        label="Feiertage"
        days={source.days.holiday}
        hours={source.hours.holiday}
      />
      <TooltipLine
        color={CATEGORY_COLOR.unpaid}
        label="Unbezahlt"
        days={source.days.unpaid}
        hours={source.hours.unpaid}
      />
    </div>
  );
}

const LEGEND = [
  { label: "Urlaub", color: CATEGORY_COLOR.vacation, opacity: 1 },
  {
    label: "Urlaub geplant",
    color: CATEGORY_COLOR.vacation,
    opacity: PLANNED_OPACITY,
  },
  {
    label: "Sonder-/Bildungsurlaub",
    color: CATEGORY_COLOR.specialLeave,
    opacity: 1,
  },
  {
    label: "Überstundenabbau",
    color: CATEGORY_COLOR.overtimeReduction,
    opacity: 1,
  },
  { label: "Krankheit", color: CATEGORY_COLOR.sick, opacity: 1 },
  { label: "Feiertag", color: CATEGORY_COLOR.holiday, opacity: 1 },
  { label: "Unbezahlt", color: CATEGORY_COLOR.unpaid, opacity: 1 },
];

/** Gestapelte Abwesenheitstage je Monat. */
export function AbsencesChart({
  months,
  showUnpaid,
  showSpecial = false,
  showOvertimeReduction = false,
}: {
  months: AbsenceMonth[];
  showUnpaid: boolean;
  showSpecial?: boolean;
  showOvertimeReduction?: boolean;
}) {
  const rows: ChartRow[] = months.map((month, index) => ({
    month: month.month,
    label: SHORT_MONTHS[index] ?? month.month,
    vacationTaken: month.days.vacation - month.plannedVacationDays,
    vacationPlanned: month.plannedVacationDays,
    special: month.days.specialLeave + month.days.educationalLeave,
    overtimeReduction: month.days.overtimeReduction,
    sick: month.days.sick,
    holiday: month.days.holiday,
    unpaid: month.days.unpaid,
    source: month,
  }));
  const hidden = new Set([
    ...(showUnpaid ? [] : ["Unbezahlt"]),
    ...(showSpecial ? [] : ["Sonder-/Bildungsurlaub"]),
    ...(showOvertimeReduction ? [] : ["Überstundenabbau"]),
  ]);
  const legend = LEGEND.filter((item) => !hidden.has(item.label));

  return (
    <figure className="min-w-0">
      <div className="h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              interval={0}
              tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={28}
              allowDecimals={false}
              tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={<ChartTooltip />}
            />
            <Bar
              dataKey="holiday"
              stackId="days"
              fill={CATEGORY_COLOR.holiday}
              maxBarSize={32}
              isAnimationActive={false}
            />
            <Bar
              dataKey="sick"
              stackId="days"
              fill={CATEGORY_COLOR.sick}
              maxBarSize={32}
              isAnimationActive={false}
            />
            <Bar
              dataKey="vacationTaken"
              stackId="days"
              fill={CATEGORY_COLOR.vacation}
              maxBarSize={32}
              isAnimationActive={false}
            />
            <Bar
              dataKey="vacationPlanned"
              stackId="days"
              fill={CATEGORY_COLOR.vacation}
              fillOpacity={PLANNED_OPACITY}
              maxBarSize={32}
              isAnimationActive={false}
            />
            {showSpecial ? (
              <Bar
                dataKey="special"
                stackId="days"
                fill={CATEGORY_COLOR.specialLeave}
                maxBarSize={32}
                isAnimationActive={false}
              />
            ) : null}
            {showOvertimeReduction ? (
              <Bar
                dataKey="overtimeReduction"
                stackId="days"
                fill={CATEGORY_COLOR.overtimeReduction}
                maxBarSize={32}
                isAnimationActive={false}
              />
            ) : null}
            {showUnpaid ? (
              <Bar
                dataKey="unpaid"
                stackId="days"
                fill={CATEGORY_COLOR.unpaid}
                maxBarSize={32}
                isAnimationActive={false}
              />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {legend.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-xs"
              style={{ background: item.color, opacity: item.opacity }}
            />
            {item.label}
          </span>
        ))}
        <span>Werte in Tagen</span>
      </figcaption>
    </figure>
  );
}
