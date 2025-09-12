"use client";

import { addWeeks, getISOWeek, getYear, subWeeks } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface WeekNavigationProps {
  year: number;
  week: number;
}

export function WeekNavigation({ year, week }: WeekNavigationProps) {
  const router = useRouter();

  const navigateToWeek = (targetYear: number, targetWeek: number) => {
    router.push(`/week/${targetYear}/${targetWeek}`);
  };

  const handlePreviousWeek = () => {
    // Erstelle ein Datum für die aktuelle Woche
    const currentDate = new Date(year, 0, 1);
    currentDate.setDate(currentDate.getDate() + (week - 1) * 7);

    // Gehe eine Woche zurück
    const previousWeek = subWeeks(currentDate, 1);
    const prevYear = getYear(previousWeek);
    const prevWeek = getISOWeek(previousWeek);

    navigateToWeek(prevYear, prevWeek);
  };

  const handleNextWeek = () => {
    // Erstelle ein Datum für die aktuelle Woche
    const currentDate = new Date(year, 0, 1);
    currentDate.setDate(currentDate.getDate() + (week - 1) * 7);

    // Gehe eine Woche vorwärts
    const nextWeek = addWeeks(currentDate, 1);
    const nextYear = getYear(nextWeek);
    const nextWeekNum = getISOWeek(nextWeek);

    navigateToWeek(nextYear, nextWeekNum);
  };

  const handleCurrentWeek = () => {
    const now = new Date();
    const currentYear = getYear(now);
    const currentWeek = getISOWeek(now);
    navigateToWeek(currentYear, currentWeek);
  };

  return (
    <div className="flex items-center justify-between">
      <Button
        variant="outline"
        size="sm"
        onClick={handlePreviousWeek}
        className="flex items-center gap-2"
      >
        <ChevronLeft className="h-4 w-4" />
        Vorherige Woche
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleCurrentWeek}
        className="flex items-center gap-2"
      >
        <Calendar className="h-4 w-4" />
        Aktuelle Woche
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleNextWeek}
        className="flex items-center gap-2"
      >
        Nächste Woche
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
