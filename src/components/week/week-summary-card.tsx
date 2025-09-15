"use client";

import {
  Calculator,
  Clock,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatHoursToTime, formatOvertimeHours } from "@/lib/utils";
import type { WeekSummary } from "@/types/statistics";

interface WeekSummaryCardProps {
  summary: WeekSummary;
}

export function WeekSummaryCard({ summary }: WeekSummaryCardProps) {
  const isPositiveWeekBalance = summary.weekBalance > 0;
  const isNegativeWeekBalance = summary.weekBalance < 0;
  const isPositiveCumulative = summary.cumulativeBalance > 0;
  const isNegativeCumulative = summary.cumulativeBalance < 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Gearbeitete Stunden */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Gearbeitete Stunden
          </CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatHoursToTime(summary.totalWorkHours)}
          </div>
          <p className="text-xs text-muted-foreground">
            Diese Woche gearbeitet
          </p>
        </CardContent>
      </Card>

      {/* Soll-Stunden */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Soll-Stunden</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatHoursToTime(summary.targetHours)}
          </div>
          <p className="text-xs text-muted-foreground">Wöchentliches Ziel</p>
        </CardContent>
      </Card>

      {/* Wochenbilanz */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Wochenbilanz</CardTitle>
          {isPositiveWeekBalance ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : isNegativeWeekBalance ? (
            <TrendingDown className="h-4 w-4 text-red-600" />
          ) : (
            <Calculator className="h-4 w-4 text-muted-foreground" />
          )}
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "text-2xl font-bold",
              isPositiveWeekBalance && "text-green-600",
              isNegativeWeekBalance && "text-red-600",
            )}
          >
            {formatOvertimeHours(summary.weekBalance)}
          </div>
          <p className="text-xs text-muted-foreground">Differenz diese Woche</p>
        </CardContent>
      </Card>

      {/* Kumulierter Saldo */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gesamtsaldo</CardTitle>
          {isPositiveCumulative ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : isNegativeCumulative ? (
            <TrendingDown className="h-4 w-4 text-red-600" />
          ) : (
            <Calculator className="h-4 w-4 text-muted-foreground" />
          )}
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "text-2xl font-bold",
              isPositiveCumulative && "text-green-600",
              isNegativeCumulative && "text-red-600",
            )}
          >
            {formatOvertimeHours(summary.cumulativeBalance)}
          </div>
          <p className="text-xs text-muted-foreground">
            Kumuliert bis KW {new Date().getFullYear()}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
