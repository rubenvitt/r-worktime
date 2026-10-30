"use client";

import { Check, ChevronDown, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ProblemBadge, StatusBadge } from "@/components/app/status-badge";
import { TargetBar } from "@/components/app/target-bar";
import type { ProblemDayDto } from "@/components/app/use-problems";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isoWeekOf } from "@/lib/dates";
import {
  formatDateShort,
  formatHours,
  formatTimeRange,
  hoursToMinutes,
} from "@/lib/format";
import { SICK_REVIEW_REASON } from "@/lib/timing/sick";
import { cn } from "@/lib/utils";

const REVIEW_REASONS = [
  "Kein Arbeitstag",
  "Unbezahlter Urlaub",
  SICK_REVIEW_REASON,
  "Feiertag",
] as const;

/** ISO-Woche eines Tages ("YYYY-MM-DD") */
export { isoWeekOf };

/** Ein offener Tag als kompakte Zeile (44 px), mobil zweizeilig. */
export function ProblemRow({
  problem,
  scaleMinutes,
  selected,
  onSelectedChange,
  onMarkAsReviewed,
  onOpenQuickEntry,
  reviewPending,
}: {
  problem: ProblemDayDto;
  scaleMinutes: number;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onMarkAsReviewed: (reason?: string) => void;
  onOpenQuickEntry: () => void;
  reviewPending?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const dateKey = problem.date.slice(0, 10);
  const dayLabel = formatDateShort(dateKey);
  const detailsId = `problem-${dateKey}`;
  const workday = !problem.isWeekend && !problem.isHoliday;
  const entryCount = problem.entries.length;
  const { year, week } = isoWeekOf(dateKey);

  return (
    <li className={cn("px-3 md:px-4", selected && "bg-accent/40")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 md:min-h-11 md:gap-x-3 md:flex-nowrap md:py-0">
        <span className="order-1 -ml-3 flex size-11 shrink-0 items-center justify-center md:-ml-2 md:size-8">
          <Checkbox
            checked={selected}
            onCheckedChange={(value) => onSelectedChange(value === true)}
            aria-label={`${dayLabel} auswählen`}
          />
        </span>
        <span className="num order-2 shrink-0 whitespace-nowrap md:w-[9ch] text-[13px] font-medium">
          {dayLabel}
        </span>
        <span className="order-3 flex shrink-0 items-center gap-1.5 md:w-[15rem]">
          <ProblemBadge type={problem.type} />
          {problem.isHoliday ? (
            <StatusBadge tone="neutral">Feiertag</StatusBadge>
          ) : problem.isWeekend ? (
            <StatusBadge tone="neutral">Wochenende</StatusBadge>
          ) : null}
        </span>

        {/* Werte: mobil zweite Zeile, Desktop zwischen Art und Aktionen */}
        <div className="order-5 flex min-w-0 basis-full items-center gap-3 pb-1 pl-8 md:order-4 md:flex-1 md:basis-auto md:pb-0 md:pl-0">
          <TargetBar
            actualMinutes={hoursToMinutes(problem.currentHours)}
            targetMinutes={hoursToMinutes(problem.expectedHours)}
            scaleMinutes={scaleMinutes}
            className="max-w-40 flex-1"
          />
          <span className="num shrink-0 whitespace-nowrap text-[13px] text-muted-foreground">
            <span className="text-foreground">
              {formatHours(problem.currentHours)}
            </span>{" "}
            von {formatHours(problem.expectedHours)}
          </span>
          {entryCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-11 shrink-0 px-2 text-[13px] font-normal text-muted-foreground md:ml-0 md:h-8"
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={() => setExpanded((value) => !value)}
            >
              {entryCount === 1 ? "1 Eintrag" : `${entryCount} Einträge`}
              <ChevronDown
                className={cn(
                  "transition-transform duration-150",
                  expanded && "rotate-180",
                )}
              />
            </Button>
          ) : null}
        </div>

        <div className="order-4 -mr-3 ml-auto flex shrink-0 items-center md:order-5 md:mr-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 md:size-8"
            aria-label={`${dayLabel} als geprüft markieren`}
            title="Als geprüft markieren"
            disabled={reviewPending}
            onClick={() => onMarkAsReviewed()}
          >
            <Check />
          </Button>
          {workday ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 md:size-8"
              aria-label={`Eintrag am ${dayLabel} nachtragen`}
              title="Eintrag nachtragen"
              onClick={onOpenQuickEntry}
            >
              <Plus />
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 md:size-8"
                aria-label={`Weitere Aktionen für ${dayLabel}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Als geprüft markieren mit Grund
              </DropdownMenuLabel>
              {REVIEW_REASONS.map((reason) => (
                <DropdownMenuItem
                  key={reason}
                  onSelect={() => onMarkAsReviewed(reason)}
                >
                  {reason === SICK_REVIEW_REASON && workday ? (
                    <span className="flex flex-col">
                      {reason}
                      <span className="text-xs text-muted-foreground">
                        Füllt mit „Krank“ auf das Soll auf
                      </span>
                    </span>
                  ) : (
                    reason
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {expanded ? (
        <div id={detailsId} className="pb-3 md:pl-[calc(9ch+2.25rem)]">
          <ul className="divide-y rounded-md border text-[13px]">
            {problem.entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-baseline gap-3 px-3 py-2"
              >
                <span className="num w-[11ch] shrink-0 text-muted-foreground">
                  {entry.startTime && entry.endTime
                    ? formatTimeRange(entry.startTime, entry.endTime)
                    : "—"}
                </span>
                <span
                  className="min-w-0 flex-1 truncate"
                  title={entry.description ?? undefined}
                >
                  {entry.description || "Ohne Beschreibung"}
                </span>
                <span className="num shrink-0">
                  {formatHours(Number(entry.duration))}
                </span>
              </li>
            ))}
          </ul>
          <Button
            asChild
            variant="link"
            size="sm"
            className="h-11 px-0 text-[13px] md:h-8"
          >
            <Link href={`/week/${year}/${week}#${dateKey}`}>
              In der Woche ansehen
            </Link>
          </Button>
        </div>
      ) : null}
    </li>
  );
}
