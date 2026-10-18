"use client";

import { type CSSProperties, type KeyboardEvent, useMemo, useRef } from "react";
import { CATEGORY_COLOR } from "@/components/reports/absences/absence-style";
import { monthRange, shiftDateKey, weekdayOfKey } from "@/lib/dates";
import { formatDateShort, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type DateSpan,
  isPlannableDay,
  type PlannerContext,
} from "@/lib/vacation-planner";

const WEEKDAY_HEADER = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Schraffur für Entwürfe: noch nicht gebucht */
const DRAFT_BACKGROUND =
  "repeating-linear-gradient(135deg, color-mix(in oklch, var(--chart-actual) 38%, transparent) 0 4px, color-mix(in oklch, var(--chart-actual) 14%, transparent) 4px 8px)";

interface MonthGrid {
  month: string;
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

function inSpan(key: string, span: DateSpan | null): boolean {
  return span !== null && key >= span.from && key <= span.to;
}

export function dayCellId(key: string): string {
  return `planner-day-${key}`;
}

export interface PlannerCalendarProps {
  year: number;
  todayKey: string;
  ctx: PlannerContext;
  /** Tag → Entwurf (id), für Farbe und Klick */
  draftByDay: ReadonlyMap<string, string>;
  /** Arbeitstage, die als Brückentag vorgeschlagen werden */
  bridgeDays: ReadonlySet<string>;
  /** Auswahl oder Vorschau (Anker bis Mauszeiger) */
  selection: DateSpan | null;
  /** Hervorgehoben, z. B. beim Zeigen auf einen Vorschlag */
  highlight: DateSpan | null;
  selectedDraftId: string | null;
  /** Tag mit Tastaturfokus (roving tabindex) */
  focusKey: string;
  onFocusKey: (key: string) => void;
  onDayClick: (key: string) => void;
  onDayHover: (key: string) => void;
  onDragSelect: (span: DateSpan) => void;
  onEscape: () => void;
}

/** Jahreskalender des Planers: Auswahl per Klick (Beginn, Ende) oder Ziehen. */
export function PlannerCalendar({
  year,
  todayKey,
  ctx,
  draftByDay,
  bridgeDays,
  selection,
  highlight,
  selectedDraftId,
  focusKey,
  onFocusKey,
  onDayClick,
  onDayHover,
  onDragSelect,
  onEscape,
}: PlannerCalendarProps) {
  const months = useMemo(() => buildMonths(year), [year]);
  // Ziehen mit der Maus: Start merken, Klick danach verschlucken
  const dragStart = useRef<string | null>(null);
  const dragged = useRef(false);

  const moveFocus = (key: string) => {
    if (key.slice(0, 4) !== String(year)) return;
    onFocusKey(key);
    document.getElementById(dayCellId(key))?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in steps) {
      event.preventDefault();
      const next = shiftDateKey(focusKey, steps[event.key]);
      moveFocus(next);
      onDayHover(next);
    } else if (event.key === "Escape") {
      onEscape();
    }
  };

  const describe = (key: string): string => {
    const parts = [formatDateShort(key)];
    const holiday = ctx.holidays[key];
    const booked = ctx.booked.get(key);
    if (holiday) parts.push(holiday);
    else if (!ctx.workDays.has(weekdayOfKey(key))) parts.push("frei");
    if (booked) {
      parts.push(
        `${booked.share < 1 ? "halber Tag " : ""}${booked.countsAsVacation ? "Urlaub" : "Abwesenheit"} gebucht`,
      );
    }
    if (draftByDay.has(key)) parts.push("Entwurf");
    if (bridgeDays.has(key)) parts.push("Brückentag-Vorschlag");
    if (inSpan(key, selection)) parts.push("ausgewählt");
    return parts.join(", ");
  };

  const cellStyle = (key: string): CSSProperties | undefined => {
    const booked = ctx.booked.get(key);
    if (booked) {
      const color = booked.countsAsVacation
        ? CATEGORY_COLOR.vacation
        : CATEGORY_COLOR.specialLeave;
      const past = key <= todayKey;
      return {
        background:
          booked.share < 1
            ? `linear-gradient(135deg, ${color} 50%, var(--muted) 50%)`
            : color,
        color: "var(--primary-foreground)",
        opacity: past ? 0.55 : 1,
      };
    }
    if (draftByDay.has(key) && isPlannableDay(key, ctx)) {
      return { background: DRAFT_BACKGROUND };
    }
    if (key in ctx.holidays) {
      return {
        background:
          "color-mix(in oklch, var(--positive) 22%, var(--background))",
        color: "var(--positive)",
      };
    }
    return undefined;
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Pfeiltasten für die Tage darin
    <div
      className="grid grid-cols-1 gap-x-6 gap-y-6 min-[440px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-4"
      onKeyDown={handleKeyDown}
      onPointerUp={() => {
        dragStart.current = null;
      }}
      onPointerLeave={() => {
        dragStart.current = null;
      }}
    >
      {months.map((grid) => {
        const monthName = formatMonth(grid.month).split(" ")[0];
        return (
          <section key={grid.month} aria-label={monthName} className="min-w-0">
            <h3 className="mb-2 text-sm font-medium">{monthName}</h3>
            <div className="grid grid-cols-7 gap-1" role="presentation">
              {WEEKDAY_HEADER.map((label) => (
                <span
                  key={label}
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
                const isWork = isPlannableDay(key, ctx);
                const isWeekend = !ctx.workDays.has(weekdayOfKey(key));
                const selected = inSpan(key, selection);
                const highlighted = inSpan(key, highlight);
                const draftId = draftByDay.get(key);
                const style = cellStyle(key);
                return (
                  <button
                    key={key}
                    id={dayCellId(key)}
                    type="button"
                    tabIndex={key === focusKey ? 0 : -1}
                    aria-label={describe(key)}
                    title={describe(key)}
                    aria-pressed={selected}
                    onClick={() => {
                      if (dragged.current) {
                        dragged.current = false;
                        return;
                      }
                      onFocusKey(key);
                      onDayClick(key);
                    }}
                    onFocus={() => onFocusKey(key)}
                    onPointerDown={(event) => {
                      dragged.current = false;
                      if (event.pointerType === "mouse" && event.button === 0) {
                        dragStart.current = key;
                      }
                    }}
                    onPointerEnter={(event) => {
                      onDayHover(key);
                      const start = dragStart.current;
                      if (
                        start &&
                        start !== key &&
                        event.pointerType === "mouse" &&
                        event.buttons === 1
                      ) {
                        dragged.current = true;
                        onDragSelect(
                          start <= key
                            ? { from: start, to: key }
                            : { from: key, to: start },
                        );
                      }
                    }}
                    className={cn(
                      "relative flex h-9 min-w-0 items-center justify-center min-[440px]:aspect-square min-[440px]:h-auto min-[440px]:min-h-7 rounded-[4px] text-[11px] tabular-nums transition-colors duration-[80ms] select-none",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      !style &&
                        (isWork
                          ? "bg-muted text-foreground hover:bg-accent"
                          : "bg-muted/40 text-muted-foreground"),
                      isWeekend && !style && "bg-transparent",
                      key === todayKey &&
                        "font-semibold outline-2 outline-offset-1 outline-foreground",
                      draftId &&
                        draftId === selectedDraftId &&
                        "ring-2 ring-primary ring-offset-1 ring-offset-card",
                      highlighted && "ring-2 ring-positive ring-offset-1",
                      selected &&
                        "bg-primary text-primary-foreground ring-0 hover:bg-primary",
                    )}
                    style={selected ? undefined : style}
                  >
                    {Number(key.slice(8, 10))}
                    {bridgeDays.has(key) && !selected ? (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-positive"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Legende unter dem Kalender */
export function PlannerLegend() {
  const items: Array<{ label: string; style: CSSProperties; dot?: boolean }> = [
    {
      label: "Feiertag",
      style: {
        background:
          "color-mix(in oklch, var(--positive) 22%, var(--background))",
      },
    },
    { label: "Urlaub gebucht", style: { background: CATEGORY_COLOR.vacation } },
    {
      label: "Andere Abwesenheit",
      style: { background: CATEGORY_COLOR.specialLeave },
    },
    { label: "Entwurf", style: { background: DRAFT_BACKGROUND } },
    { label: "Brückentag", style: {}, dot: true },
  ];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          {item.dot ? (
            <span
              aria-hidden="true"
              className="flex size-3 items-end justify-center rounded-xs bg-muted pb-px"
            >
              <span className="size-1 rounded-full bg-positive" />
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="size-3 rounded-xs"
              style={item.style}
            />
          )}
          {item.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-2.5 rounded-xs outline-2 outline-offset-1 outline-foreground"
        />
        Heute
      </li>
    </ul>
  );
}
