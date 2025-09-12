"use client";

import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Clock, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DayData } from "@/types/statistics";

interface DayRowProps {
  day: DayData;
}

export function DayRow({ day }: DayRowProps) {
  const isPositiveBalance = day.difference > 0;
  const isNegativeBalance = day.difference < 0;

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border",
        day.isWeekend && "bg-muted/50",
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
        {/* Datum und Tag */}
        <div className="min-w-[150px]">
          <p className="font-medium">
            {format(new Date(day.date), "EEEE", { locale: de })}
          </p>
          <p className="text-sm text-muted-foreground">
            {format(new Date(day.date), "dd.MM.yyyy")}
          </p>
        </div>

        {/* Arbeitszeiten */}
        <div className="flex items-center gap-6 flex-1">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-medium">{day.totalHours.toFixed(2)}h</span>
              <span className="text-muted-foreground">
                {" "}
                / {day.targetHours}h
              </span>
            </span>
          </div>

          {/* Einträge */}
          {day.entries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {day.entries.map((entry) => (
                <Badge key={entry.id} variant="secondary" className="text-xs">
                  {format(new Date(entry.startTime), "HH:mm")} -{" "}
                  {format(new Date(entry.endTime), "HH:mm")}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Differenz */}
      <div className="flex items-center gap-2 mt-2 sm:mt-0">
        {isPositiveBalance && (
          <>
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="font-medium text-green-600">
              +{day.difference.toFixed(2)}h
            </span>
          </>
        )}
        {isNegativeBalance && (
          <>
            <TrendingDown className="h-4 w-4 text-red-600" />
            <span className="font-medium text-red-600">
              {day.difference.toFixed(2)}h
            </span>
          </>
        )}
        {day.difference === 0 && (
          <span className="font-medium text-muted-foreground">±0.00h</span>
        )}
      </div>
    </div>
  );
}
