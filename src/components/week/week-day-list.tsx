"use client";

import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Delta, Duration } from "@/components/app/duration";
import { Panel } from "@/components/app/panel";
import {
  EntryTypeBadge,
  RunningBadge,
  StatusBadge,
} from "@/components/app/status-badge";
import { TargetBar } from "@/components/app/target-bar";
import { EditEntryDialog } from "@/components/entries/edit-entry-dialog";
import { QuickEntryModal } from "@/components/problems/quick-entry-modal";
import { Button } from "@/components/ui/button";
import { formatDateShort, formatTimeRange, hoursToMinutes } from "@/lib/format";
import type { EntryTypeKey } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DayData } from "@/types/statistics";
import { dayKeyOf, overlappingIds } from "./week-utils";

const ABSENCE_TYPES: ReadonlySet<string> = new Set([
  "VACATION",
  "SICK",
  "HOLIDAY",
]);

interface DayView {
  day: DayData;
  key: string;
  actual: number;
  target: number;
  isToday: boolean;
  isPast: boolean;
  overlaps: Set<string>;
  absenceTypes: EntryTypeKey[];
}

function toView(day: DayData, todayKey: string): DayView {
  const key = dayKeyOf(day.date);
  const types = Array.from(new Set(day.entries.map((e) => e.type)));
  const allAbsence =
    day.entries.length > 0 && types.every((t) => ABSENCE_TYPES.has(t));
  return {
    day,
    key,
    actual: hoursToMinutes(day.totalHours),
    target: hoursToMinutes(day.targetHours),
    isToday: key === todayKey,
    isPast: key < todayKey,
    overlaps: overlappingIds(day.entries),
    absenceTypes: allAbsence ? (types as EntryTypeKey[]) : [],
  };
}

function hashKey(): string | null {
  if (typeof window === "undefined") return null;
  const value = decodeURIComponent(window.location.hash.slice(1));
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function DayDelta({ view }: { view: DayView }) {
  if (view.isToday) return <RunningBadge />;
  if (!view.isPast) return <Delta minutes={null} />;
  return (
    <Delta minutes={view.actual - view.target} noTarget={view.target === 0} />
  );
}

function ActualOfTarget({ view }: { view: DayView }) {
  return (
    <span className="num whitespace-nowrap">
      <Duration minutes={view.actual} />
      <span className="text-muted-foreground">
        {" / "}
        <Duration minutes={view.target} />
      </span>
    </span>
  );
}

/** Tageszeilen der Woche; ein Tag klappt seine Einträge auf. */
export function WeekDayList({
  days,
  todayKey,
  onChanged,
}: {
  days: DayData[];
  todayKey: string;
  onChanged: () => void;
}) {
  const views = days.map((day) => toView(day, todayKey));
  const scale = Math.max(600, ...views.map((v) => v.actual));

  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [editId, setEditId] = useState<string | null>(null);
  const [fillKey, setFillKey] = useState<string | null>(null);

  const toggle = useCallback((key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Ein Hash (#YYYY-MM-DD) klappt den Tag auf und scrollt zu ihm.
  useEffect(() => {
    const openFromHash = () => {
      const key = hashKey();
      if (!key) return;
      setOpen((prev) => new Set(prev).add(key));
      requestAnimationFrame(() => {
        document
          .getElementById(key)
          ?.scrollIntoView({ block: "center", behavior: "auto" });
      });
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  const fillView = views.find((v) => v.key === fillKey);

  return (
    <Panel>
      <ul className="divide-y">
        {views.map((view) => {
          const { day, key } = view;
          const hasEntries = day.entries.length > 0;

          if (day.isWeekend && !hasEntries) {
            return (
              <li
                key={key}
                id={key}
                className="flex h-11 scroll-mt-20 items-center gap-3 px-4 text-[13px] leading-[18px] text-muted-foreground"
              >
                <span className="w-5 shrink-0" />
                <span className="w-[10ch] shrink-0 whitespace-nowrap">
                  {formatDateShort(key)}
                </span>
                <span>—</span>
              </li>
            );
          }

          const isOpen = open.has(key) && hasEntries;
          const missing = !hasEntries && view.target > 0 && view.isPast;
          const panelId = `${key}-entries`;
          const fillButton = (className: string) => (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("shrink-0", className)}
              onClick={() => setFillKey(key)}
            >
              Nachtragen
            </Button>
          );

          const badges = (
            <>
              {view.overlaps.size > 0 ? (
                <StatusBadge tone="warning">Überschneidung</StatusBadge>
              ) : null}
              {missing ? (
                <StatusBadge tone="negative">Keine Einträge</StatusBadge>
              ) : null}
              {view.absenceTypes.map((type) => (
                <EntryTypeBadge key={type} type={type} />
              ))}
              {day.holiday ? (
                <StatusBadge
                  tone={day.holiday.imported ? "neutral" : "warning"}
                  title={
                    day.holiday.imported
                      ? "Feiertag, mindert das Soll"
                      : "Feiertag nicht importiert – zählt im Saldo noch als Soll"
                  }
                >
                  {day.holiday.imported
                    ? day.holiday.name
                    : `${day.holiday.name} · nicht importiert`}
                </StatusBadge>
              ) : null}
            </>
          );

          const rowContent = (
            <>
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-[160ms]",
                  isOpen && "rotate-90",
                  !hasEntries && "invisible",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "w-[10ch] shrink-0 whitespace-nowrap",
                      view.isToday && "font-medium",
                    )}
                  >
                    {formatDateShort(key)}
                  </span>
                  <TargetBar
                    className="hidden max-w-60 flex-1 md:flex"
                    actualMinutes={view.actual}
                    targetMinutes={view.target}
                    scaleMinutes={scale}
                    running={view.isToday}
                  />
                  <span className="hidden w-[13ch] shrink-0 text-right md:inline">
                    <ActualOfTarget view={view} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 md:flex-none">
                    {badges}
                  </span>
                  <span className="ml-auto flex shrink-0 justify-end md:w-[7ch]">
                    <DayDelta view={view} />
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-3 md:hidden">
                  <TargetBar
                    className="flex-1"
                    actualMinutes={view.actual}
                    targetMinutes={view.target}
                    scaleMinutes={scale}
                    running={view.isToday}
                  />
                  <ActualOfTarget view={view} />
                  {/* Nur in Zeilen ohne Einträge (div, kein Button) – mobil in Zeile 2 */}
                  {missing ? fillButton("h-11 md:hidden") : null}
                </div>
              </div>
            </>
          );

          return (
            <li key={key} id={key} className="scroll-mt-20">
              <div className="flex items-center">
                {hasEntries ? (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(key)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left text-[13px] leading-[18px] transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:py-0"
                  >
                    {rowContent}
                  </button>
                ) : (
                  <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-[13px] leading-[18px] md:py-0">
                    {rowContent}
                  </div>
                )}
                {missing ? fillButton("mr-4 hidden h-8 md:inline-flex") : null}
              </div>

              {isOpen ? (
                <ul
                  id={panelId}
                  className="border-t bg-background/60 py-1 pl-11 pr-4 md:pl-[3.75rem]"
                >
                  {day.entries.map((entry) => {
                    const overlap = view.overlaps.has(entry.id);
                    const text =
                      entry.description?.trim() || "Ohne Beschreibung";
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => setEditId(entry.id)}
                          title={entry.description ?? undefined}
                          className={cn(
                            "-ml-2 grid w-[calc(100%+0.5rem)] grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 rounded-md py-1.5 pl-2 pr-1 text-left text-[13px] leading-[18px] transition-colors duration-[120ms] hover:bg-accent sm:grid-cols-[11ch_minmax(0,1fr)_auto]",
                            overlap &&
                              "rounded-l-none border-l-2 border-warning",
                          )}
                        >
                          <span className="num text-muted-foreground">
                            {entry.type === "OVERTIME"
                              ? "—"
                              : formatTimeRange(entry.startTime, entry.endTime)}
                          </span>
                          <span
                            className={cn(
                              "col-span-2 row-start-2 line-clamp-2 sm:col-span-1 sm:row-start-auto",
                              !entry.description && "text-muted-foreground",
                            )}
                          >
                            {text}
                            {entry.type !== "WORK" ? (
                              <span className="ml-2 inline-flex align-middle">
                                <EntryTypeBadge
                                  type={entry.type as EntryTypeKey}
                                />
                              </span>
                            ) : null}
                          </span>
                          <span className="col-start-2 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
                            <Duration
                              minutes={hoursToMinutes(entry.duration)}
                            />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      <EditEntryDialog
        open={editId !== null}
        onOpenChange={(value) => {
          if (!value) setEditId(null);
        }}
        entryId={editId}
        onEntryUpdated={onChanged}
      />
      {fillView ? (
        <QuickEntryModal
          open={fillKey !== null}
          onOpenChange={(value) => {
            if (!value) setFillKey(null);
          }}
          date={new Date(`${fillView.key}T12:00:00`)}
          suggestedHours={fillView.day.targetHours}
          onSuccess={() => {
            setFillKey(null);
            onChanged();
          }}
        />
      ) : null}
    </Panel>
  );
}
