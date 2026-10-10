"use client";

import { ArrowRight, Calendar } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currentIsoWeek } from "@/components/week/week-utils";

export function WeekHoursCard() {
  const { year: currentYear, week: currentWeek } = currentIsoWeek();

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Wochenstunden</CardTitle>
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">KW {currentWeek}</div>
        <p className="text-xs text-muted-foreground mb-3">
          Aktuelle Kalenderwoche
        </p>
        <Link href={`/week/${currentYear}/${currentWeek}`}>
          <Button size="sm" variant="outline" className="w-full">
            Zur Wochenansicht
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
