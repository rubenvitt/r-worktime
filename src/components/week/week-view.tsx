"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWeekData } from "@/hooks/use-week-data";
import { DayRow } from "./day-row";
import { WeekNavigation } from "./week-navigation";
import { WeekSummaryCard } from "./week-summary-card";

interface WeekViewProps {
  year: number;
  week: number;
}

export function WeekView({ year, week }: WeekViewProps) {
  const { data, isLoading, error } = useWeekData(year, week);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Fehler beim Laden der Wochendaten. Bitte versuchen Sie es später
          erneut.
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Keine Daten für diese Woche verfügbar.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <WeekNavigation year={year} week={week} />

      {/* Wochentitel */}
      <div className="text-center">
        <h1 className="text-3xl font-bold">
          Kalenderwoche {week} / {year}
        </h1>
        <p className="text-muted-foreground mt-2">
          {new Date(data.data.weekStartDate).toLocaleDateString("de-DE")} -{" "}
          {new Date(data.data.weekEndDate).toLocaleDateString("de-DE")}
        </p>
      </div>

      {/* Wochenzusammenfassung */}
      <WeekSummaryCard summary={data.data.summary} />

      {/* Tagesübersicht */}
      <Card>
        <CardHeader>
          <CardTitle>Tagesübersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.data.days.map((day) => (
              <DayRow key={day.date.toString()} day={day} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
