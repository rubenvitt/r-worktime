"use client";

import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatActivityLine } from "@/lib/timesheet/aggregate";
import { MAX_TEXT_LENGTH } from "@/lib/timesheet/extension-protocol";
import type { TimesheetDayView } from "@/lib/timesheet/types";
import { cn } from "@/lib/utils";

const weekdayFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

export function formatDayLabel(dateKey: string): string {
  return weekdayFormatter.format(new Date(`${dateKey}T00:00:00Z`));
}

interface TimesheetDayCardProps {
  day: TimesheetDayView;
  travelFee: boolean;
  onTravelFeeChange: (value: boolean) => void;
  onCopy: (text: string, label: string) => void;
  /** true, solange noch Daten der vorherigen Einstellung angezeigt werden */
  copyDisabled?: boolean;
}

export function TimesheetDayCard({
  day,
  travelFee,
  onTravelFeeChange,
  onCopy,
  copyDisabled = false,
}: TimesheetDayCardProps) {
  const [expanded, setExpanded] = useState(false);
  const switchId = `travel-${day.date}`;
  const tooLong = day.text.length > MAX_TEXT_LENGTH;
  const incompleteEntries = day.missingEntries.filter((e) => !e.isCritical);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 px-2"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Details zuklappen" : "Details aufklappen"}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-semibold">{formatDayLabel(day.date)}</span>
        </Button>
        <span className="font-mono text-lg font-semibold tabular-nums">
          {day.hours}
        </span>

        {day.criticalCount > 0 && (
          <Badge variant="destructive">
            {day.criticalCount === 1
              ? "1 fehlende Notiz"
              : `${day.criticalCount} fehlende Notizen`}
          </Badge>
        )}
        {day.hasIncompleteActivities && (
          <Badge
            variant="outline"
            className="border-amber-500 text-amber-700 dark:text-amber-400"
          >
            Unvollständig
          </Badge>
        )}
        {tooLong && (
          <Badge
            variant="outline"
            className="border-amber-500 text-amber-700 dark:text-amber-400"
          >
            {day.text.length} Zeichen
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id={switchId}
              checked={travelFee}
              onCheckedChange={onTravelFeeChange}
            />
            <Label htmlFor={switchId} className="text-sm font-normal">
              Dienstreise
              {travelFee !== day.travelFee && (
                <span className="text-muted-foreground"> (manuell)</span>
              )}
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={copyDisabled}
            onClick={() => onCopy(day.text, "Text")}
          >
            <Copy className="mr-1 h-3.5 w-3.5" />
            Text kopieren
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4 pb-4">
        <p
          className={cn(
            "whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 font-mono text-xs",
            !expanded && "line-clamp-2",
          )}
        >
          {day.text || "–"}
        </p>
        {tooLong && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Der Text ist länger als {MAX_TEXT_LENGTH} Zeichen. Die Extension
            lehnt ihn so ab – kürze die Notizen in Timing.
          </p>
        )}

        {expanded && (
          <div className="space-y-3">
            <ul className="divide-y rounded-md border">
              {day.activities.map((activity) => (
                <li
                  key={activity.title}
                  className="flex items-start gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium break-words">
                        {activity.title}
                      </span>
                      {activity.isCritical && (
                        <Badge variant="destructive">Keine Notiz</Badge>
                      )}
                      {activity.hasMissingEntries && (
                        <Badge
                          variant="outline"
                          className="border-amber-500 text-amber-700 dark:text-amber-400"
                        >
                          Unvollständig
                        </Badge>
                      )}
                      {activity.isTitleWithParentheses &&
                        activity.notes.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            Benötigt keine weiteren Notizen
                          </span>
                        )}
                    </div>
                    {activity.notes.length > 0 && (
                      <ul className="list-disc pl-5 text-sm text-muted-foreground">
                        {activity.notes.map((note) => (
                          <li key={note} className="break-words">
                            {note}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <span className="font-mono text-sm tabular-nums">
                    {activity.hours}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    aria-label={`„${activity.title}“ kopieren`}
                    disabled={copyDisabled}
                    onClick={() =>
                      onCopy(formatActivityLine(activity), "Aktivität")
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>

            {incompleteEntries.length > 0 && (
              <div className="text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  Einträge ohne Notiz:
                </p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {incompleteEntries.map((entry, index) => (
                    <li key={`${entry.activity}-${entry.start}-${index}`}>
                      {entry.start}–{entry.end} · {entry.activity}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
