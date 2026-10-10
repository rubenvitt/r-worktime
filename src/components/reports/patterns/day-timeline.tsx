"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isoWeekOf } from "@/lib/dates";
import { formatDateShort, formatDuration } from "@/lib/format";
import { formatClock, type PatternDay } from "@/lib/reports/patterns";

const INITIAL_VISIBLE = 14;

/** Gemeinsame Skala aller Zeilen in vollen Stunden, mindestens 07–19 Uhr. */
function scaleOf(days: PatternDay[]): { from: number; to: number } {
  let from = 7 * 60;
  let to = 19 * 60;
  for (const day of days) {
    from = Math.min(from, Math.floor(day.startMinute / 60) * 60);
    to = Math.max(to, Math.ceil(day.endMinute / 60) * 60);
  }
  return { from, to };
}

/** Tagesverlauf: jeder Arbeitstag als Zeile mit seinen Arbeitsblöcken. */
export function DayTimeline({ days }: { days: PatternDay[] }) {
  const [expanded, setExpanded] = useState(false);
  const newestFirst = [...days].reverse();
  const visible = expanded
    ? newestFirst
    : newestFirst.slice(0, INITIAL_VISIBLE);
  const scale = scaleOf(days);
  const width = scale.to - scale.from;
  const pos = (minute: number) => ((minute - scale.from) / width) * 100;
  const ticks: number[] = [];
  for (let m = scale.from; m <= scale.to; m += 120) ticks.push(m);

  return (
    <div>
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-end gap-x-3 px-4 pb-1 text-[11px] text-muted-foreground sm:grid-cols-[7.5rem_minmax(0,1fr)_7rem_3.5rem]">
        <span>Tag</span>
        <span className="relative h-4" aria-hidden="true">
          {ticks.map((m) => (
            <span
              key={m}
              className="num absolute -translate-x-1/2"
              style={{ left: `${pos(m)}%` }}
            >
              {formatClock(m).slice(0, 2)}
            </span>
          ))}
        </span>
        <span className="hidden text-right sm:block">Beginn–Ende</span>
        <span className="text-right">Netto</span>
      </div>
      <ul className="divide-y border-t">
        {visible.map((day) => {
          const { year, week } = isoWeekOf(day.date);
          return (
            <li key={day.date}>
              <Link
                href={`/week/${year}/${week}`}
                className="grid min-h-11 grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-x-3 px-4 py-1.5 transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[7.5rem_minmax(0,1fr)_7rem_3.5rem]"
              >
                <span className="num text-sm">{formatDateShort(day.date)}</span>
                <span
                  className="relative h-3 rounded-xs bg-muted"
                  role="img"
                  aria-label={`${formatClock(day.startMinute)} bis ${formatClock(day.endMinute)}, ${day.breaks.length} ${day.breaks.length === 1 ? "Pause" : "Pausen"} (${formatDuration(day.breakMinutes)})`}
                >
                  {day.blocks.map((block) => (
                    <span
                      key={block.startMinute}
                      className="absolute inset-y-0 rounded-xs bg-chart-actual"
                      style={{
                        left: `${pos(block.startMinute)}%`,
                        width: `max(2px, ${pos(block.endMinute) - pos(block.startMinute)}%)`,
                      }}
                    />
                  ))}
                </span>
                <span className="num hidden text-right text-xs text-muted-foreground sm:block">
                  {formatClock(day.startMinute)}–{formatClock(day.endMinute)}
                </span>
                <span className="num text-right text-sm">
                  {formatDuration(day.netMinutes)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {days.length > INITIAL_VISIBLE ? (
        <div className="border-t px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 md:h-8"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded
              ? "Weniger anzeigen"
              : `Alle ${days.length} Tage anzeigen`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
