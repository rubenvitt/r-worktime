"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { monthRange, shiftDateKey, weekdayOfKey } from "@/lib/dates";
import { formatMonth } from "@/lib/format";
import type { AbsenceCategory, AbsenceDay } from "@/lib/reports/absences";
import { cn } from "@/lib/utils";
import {
  CATEGORY_COLOR,
  describeAbsenceDay,
  formatDays,
  PLANNED_OPACITY,
} from "./absence-style";

const WEEKDAY_HEADER = ["M", "D", "M", "D", "F", "S", "S"];

interface MonthGrid {
  month: string;
  /** Leere Zellen vor dem 1. (Montag zuerst) */
  offset: number;
  dayKeys: string[];
}

function buildMonths(year: number): MonthGrid[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const range = monthRange(month);
    const count = Number(range.lastKey.slice(8, 10));
    return {
      month,
      offset: (weekdayOfKey(range.firstKey) + 6) % 7,
      dayKeys: Array.from({ length: count }, (_, i) =>
        shiftDateKey(range.firstKey, i),
      ),
    };
  });
}

/** Hintergrund einer Abwesenheitszelle: Farbe je Kategorie, halbe Tage diagonal geteilt. */
function cellStyle(day: AbsenceDay): CSSProperties {
  const color = CATEGORY_COLOR[day.primary];
  const counted = day.days[day.primary];
  const half = day.isWorkDay && counted > 0 && counted < 1;
  // Geplant (nach heute) blass, außer Feiertag und Krankheit
  const faded =
    !day.isWorkDay ||
    (day.isFuture && day.primary !== "holiday" && day.primary !== "sick");
  return {
    background: half
      ? `linear-gradient(135deg, ${color} 50%, var(--muted) 50%)`
      : color,
    opacity: faded ? PLANNED_OPACITY : 1,
  };
}

/** Jahreskalender: 12 Monatsraster, Farbe je Abwesenheitsart. */
export function AbsencesCalendar({
  year,
  todayKey,
  days,
  workDays,
}: {
  year: number;
  todayKey: string;
  days: AbsenceDay[];
  workDays: number[];
}) {
  const months = useMemo(() => buildMonths(year), [year]);
  const byKey = useMemo(
    () => new Map(days.map((day) => [day.dateKey, day])),
    [days],
  );
  const workDaySet = useMemo(() => new Set(workDays), [workDays]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = selectedKey ? byKey.get(selectedKey) : undefined;
  const hasPrimary = (category: AbsenceCategory) =>
    days.some((day) => day.primary === category);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
        {months.map((grid) => {
          const monthDays = grid.dayKeys
            .map((key) => byKey.get(key))
            .filter((day): day is AbsenceDay => Boolean(day));
          const counted = monthDays.reduce(
            (acc, day) =>
              acc +
              day.days.vacation +
              day.days.sick +
              day.days.holiday +
              day.days.unpaid,
            0,
          );
          const monthName = formatMonth(grid.month).split(" ")[0];
          return (
            <section
              key={grid.month}
              aria-label={`${monthName}: ${counted > 0 ? formatDays(counted) : "keine Abwesenheit"}`}
              className="min-w-0"
            >
              <h3 className="mb-1.5 flex items-baseline justify-between text-xs font-medium">
                {monthName}
                {counted > 0 ? (
                  <span className="num font-normal text-muted-foreground">
                    {formatDays(counted)}
                  </span>
                ) : null}
              </h3>
              <div className="grid grid-cols-7 gap-[3px]">
                {WEEKDAY_HEADER.map((label, index) => (
                  <span
                    key={index}
                    aria-hidden="true"
                    className="text-center text-[10px] leading-4 text-muted-foreground"
                  >
                    {label}
                  </span>
                ))}
                {Array.from({ length: grid.offset }, (_, i) => (
                  <span key={`pad-${i}`} aria-hidden="true" />
                ))}
                {grid.dayKeys.map((key) => {
                  const day = byKey.get(key);
                  const isToday = key === todayKey;
                  const base = cn(
                    "aspect-square rounded-[3px]",
                    isToday && "outline-2 outline-offset-1 outline-foreground",
                  );
                  if (!day) {
                    const isWorkDay = workDaySet.has(weekdayOfKey(key));
                    return (
                      <span
                        key={key}
                        aria-hidden="true"
                        className={cn(
                          base,
                          isWorkDay ? "bg-muted" : "bg-muted/40",
                        )}
                      />
                    );
                  }
                  const label = describeAbsenceDay(day);
                  return (
                    <button
                      key={key}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={selectedKey === key}
                      onClick={() => setSelectedKey(key)}
                      onFocus={() => setSelectedKey(key)}
                      className={cn(
                        base,
                        "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                        selectedKey === key &&
                          "ring-2 ring-ring ring-offset-1 ring-offset-card",
                      )}
                      style={cellStyle(day)}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <p
        aria-live="polite"
        className="num min-h-5 text-[13px] text-muted-foreground"
      >
        {selected ? (
          <span className="text-foreground">
            {describeAbsenceDay(selected)}
          </span>
        ) : (
          "Tipp oder zeig auf einen markierten Tag für Details."
        )}
      </p>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <LegendItem color={CATEGORY_COLOR.vacation} label="Urlaub" />
        <LegendItem
          color={CATEGORY_COLOR.vacation}
          opacity={PLANNED_OPACITY}
          label="Urlaub geplant"
        />
        {hasPrimary("specialLeave") || hasPrimary("educationalLeave") ? (
          <LegendItem
            color={CATEGORY_COLOR.specialLeave}
            label="Sonder-/Bildungsurlaub"
          />
        ) : null}
        {hasPrimary("overtimeReduction") ? (
          <LegendItem
            color={CATEGORY_COLOR.overtimeReduction}
            label="Überstundenabbau"
          />
        ) : null}
        <LegendItem color={CATEGORY_COLOR.sick} label="Krankheit" />
        <LegendItem color={CATEGORY_COLOR.holiday} label="Feiertag" />
        <LegendItem color={CATEGORY_COLOR.unpaid} label="Unbezahlt" />
        <LegendItem
          color={`linear-gradient(135deg, ${CATEGORY_COLOR.vacation} 50%, var(--muted) 50%)`}
          label="Halber Tag"
        />
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-xs outline-2 outline-offset-1 outline-foreground"
          />
          Heute
        </li>
      </ul>
    </div>
  );
}

function LegendItem({
  color,
  label,
  opacity = 1,
}: {
  color: string;
  label: string;
  opacity?: number;
}) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-2.5 rounded-xs"
        style={{ background: color, opacity }}
      />
      {label}
    </li>
  );
}
