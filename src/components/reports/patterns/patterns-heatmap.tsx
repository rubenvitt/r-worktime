"use client";

import { useState } from "react";
import { formatDecimal, formatDuration } from "@/lib/format";
import { type HeatmapRow, WEEKDAY_SHORT } from "@/lib/reports/patterns";

/** Kleinster sichtbarer Stundenbereich, damit auch dünne Daten lesbar bleiben. */
const MIN_FROM_HOUR = 7;
const MIN_TO_HOUR = 19;

interface Hovered {
  weekday: number;
  hour: number;
}

function visibleHours(rows: HeatmapRow[]): number[] {
  let first = MIN_FROM_HOUR;
  let last = MIN_TO_HOUR;
  for (const row of rows) {
    row.minutes.forEach((minutes, hour) => {
      if (minutes <= 0) return;
      first = Math.min(first, hour);
      last = Math.max(last, hour);
    });
  }
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

function cellColor(share: number): string {
  if (share <= 0) return "var(--muted)";
  // Eine Farbe, hell → dunkel; Mindestdeckung, damit kleine Werte sichtbar bleiben
  const strength = Math.round(12 + share * 88);
  return `color-mix(in oklch, var(--chart-actual) ${strength}%, var(--card))`;
}

function percent(share: number): string {
  return `${formatDecimal(share * 100, 0)} %`;
}

/** Wochentag × Stunde: Anteil der gearbeiteten Minuten je Stundenslot. */
export function PatternsHeatmap({ rows }: { rows: HeatmapRow[] }) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const hours = visibleHours(rows);
  const hoveredRow = hovered
    ? rows.find((row) => row.weekday === hovered.weekday)
    : undefined;

  const peak = rows
    .flatMap((row) =>
      row.share.map((share, hour) => ({ weekday: row.weekday, hour, share })),
    )
    .reduce<{ weekday: number; hour: number; share: number } | null>(
      (best, cell) => (cell.share > (best?.share ?? 0) ? cell : best),
      null,
    );

  const summary = peak
    ? `Heatmap Wochentag mal Stunde. Am häufigsten gearbeitet: ${WEEKDAY_SHORT[peak.weekday]} ${peak.hour} bis ${peak.hour + 1} Uhr (${percent(peak.share)}).`
    : "Heatmap Wochentag mal Stunde, keine Daten.";

  return (
    <figure className="min-w-0">
      <div className="-mx-4 overflow-x-auto px-4 pb-1">
        <div
          role="img"
          aria-label={summary}
          className="grid min-w-[30rem] gap-[2px]"
          style={{
            gridTemplateColumns: `2.5rem repeat(${hours.length}, minmax(0, 1fr))`,
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setHovered(null);
          }}
        >
          <div aria-hidden="true" />
          {hours.map((hour) => (
            <div
              key={hour}
              aria-hidden="true"
              className="num pb-1 text-center text-[11px] text-muted-foreground"
            >
              {hour % 2 === 0 ? hour : ""}
            </div>
          ))}
          {rows.map((row) => (
            <HeatmapRowCells
              key={row.weekday}
              row={row}
              hours={hours}
              hovered={hovered}
              onHover={setHovered}
            />
          ))}
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span className="num min-h-4" aria-live="polite">
          {hovered && hoveredRow ? (
            <>
              <span className="font-medium text-foreground">
                {WEEKDAY_SHORT[hovered.weekday]} {hovered.hour}–
                {hovered.hour + 1} Uhr
              </span>
              {": "}
              {percent(hoveredRow.share[hovered.hour])} · Ø{" "}
              {formatDuration(
                hoveredRow.days > 0
                  ? hoveredRow.minutes[hovered.hour] / hoveredRow.days
                  : 0,
              )}{" "}
              von 1:00 an {hoveredRow.days}{" "}
              {hoveredRow.days === 1 ? "Arbeitstag" : "Arbeitstagen"}
            </>
          ) : (
            "Anteil je Stunde, bezogen auf die Tage dieses Wochentags mit Arbeit"
          )}
        </span>
        <span className="flex items-center gap-2" aria-hidden="true">
          0 %
          <span
            className="h-2.5 w-24 rounded-xs"
            style={{
              background:
                "linear-gradient(to right, color-mix(in oklch, var(--chart-actual) 12%, var(--card)), var(--chart-actual))",
            }}
          />
          100 %
        </span>
      </figcaption>
    </figure>
  );
}

function HeatmapRowCells({
  row,
  hours,
  hovered,
  onHover,
}: {
  row: HeatmapRow;
  hours: number[];
  hovered: Hovered | null;
  onHover: (cell: Hovered) => void;
}) {
  const label = WEEKDAY_SHORT[row.weekday];
  return (
    <>
      <div
        aria-hidden="true"
        className="flex items-center gap-1 pr-1 text-xs"
        title={`${row.days} ${row.days === 1 ? "Tag" : "Tage"} mit Arbeit`}
      >
        <span className={row.days === 0 ? "text-muted-foreground" : ""}>
          {label}
        </span>
        <span className="num text-[10px] text-muted-foreground">
          {row.days}
        </span>
      </div>
      {hours.map((hour) => {
        const share = row.share[hour];
        const active =
          hovered?.weekday === row.weekday && hovered.hour === hour;
        return (
          <div
            key={hour}
            aria-hidden="true"
            title={`${label} ${hour}–${hour + 1} Uhr: ${percent(share)}`}
            onPointerEnter={() => onHover({ weekday: row.weekday, hour })}
            onPointerDown={() => onHover({ weekday: row.weekday, hour })}
            className={
              active
                ? "h-6 rounded-[3px] outline-2 outline-offset-1 outline-foreground md:h-7"
                : "h-6 rounded-[3px] md:h-7"
            }
            style={{ background: cellColor(share) }}
          />
        );
      })}
    </>
  );
}
