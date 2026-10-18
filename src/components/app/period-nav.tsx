"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type * as React from "react";
import { useHotkeys } from "@/components/app/use-hotkeys";
import { Button } from "@/components/ui/button";

/** Zeitraum-Navigation (Woche, Monat, Jahr) mit Tastenkürzeln [ ] t. */
export function PeriodNav({
  label,
  shortLabel,
  onPrev,
  onNext,
  onToday,
  isCurrent,
  prevLabel,
  nextLabel,
  todayLabel = "Heute",
  prevDisabled,
  nextDisabled,
  hotkeys = true,
  children,
}: {
  label: string;
  shortLabel?: string;
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
  isCurrent?: boolean;
  prevLabel: string;
  nextLabel: string;
  todayLabel?: string;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  hotkeys?: boolean;
  children?: React.ReactNode;
}) {
  const showToday = Boolean(onToday) && !isCurrent;

  useHotkeys(
    {
      "[": () => {
        if (!prevDisabled) onPrev();
      },
      "]": () => {
        if (!nextDisabled) onNext();
      },
      t: () => {
        if (onToday && !isCurrent) onToday();
      },
    },
    { enabled: hotkeys },
  );

  return (
    <div className="flex w-full items-center gap-1 md:w-auto">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 md:size-8"
        onClick={onPrev}
        disabled={prevDisabled}
        aria-label={prevLabel}
      >
        <ChevronLeft />
      </Button>
      <div
        className="num flex min-w-[10ch] flex-1 items-center justify-center text-center text-sm font-medium md:flex-none"
        aria-live="polite"
      >
        {children ??
          (shortLabel ? (
            <>
              <span className="md:hidden">{shortLabel}</span>
              <span className="hidden md:inline">{label}</span>
            </>
          ) : (
            label
          ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 md:size-8"
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={nextLabel}
      >
        <ChevronRight />
      </Button>
      {showToday ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-1 h-11 md:h-8"
          onClick={onToday}
        >
          {todayLabel}
        </Button>
      ) : null}
    </div>
  );
}
