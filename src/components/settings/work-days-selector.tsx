"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { WORK_DAY_LABELS, WORK_DAYS } from "@/types/settings";

interface WorkDaysSelectorProps {
  value: number[];
  onChange: (days: number[]) => void;
  error?: string;
}

export function WorkDaysSelector({
  value,
  onChange,
  error,
}: WorkDaysSelectorProps) {
  const handleToggleDay = (day: number) => {
    if (value.includes(day)) {
      onChange(value.filter((d) => d !== day));
    } else {
      onChange([...value, day].sort((a, b) => a - b));
    }
  };

  // Order days starting from Monday
  const orderedDays = [
    WORK_DAYS.MONDAY,
    WORK_DAYS.TUESDAY,
    WORK_DAYS.WEDNESDAY,
    WORK_DAYS.THURSDAY,
    WORK_DAYS.FRIDAY,
    WORK_DAYS.SATURDAY,
    WORK_DAYS.SUNDAY,
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {orderedDays.map((day) => (
          <div key={day} className="flex items-center space-x-2">
            <Checkbox
              id={`day-${day}`}
              checked={value.includes(day)}
              onCheckedChange={() => handleToggleDay(day)}
              className="cursor-pointer"
            />
            <Label
              htmlFor={`day-${day}`}
              className="text-sm font-medium cursor-pointer select-none"
            >
              {WORK_DAY_LABELS[day]}
            </Label>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
