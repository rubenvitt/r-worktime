"use client";

import { cn } from "@/lib/utils";
import { WORK_DAY_LABELS, WORK_DAYS } from "@/types/settings";

interface WorkDaysSelectorProps {
  value: number[];
  onChange: (days: number[]) => void;
  error?: string;
}

// Wochenbeginn Montag
const ORDERED_DAYS = [
  WORK_DAYS.MONDAY,
  WORK_DAYS.TUESDAY,
  WORK_DAYS.WEDNESDAY,
  WORK_DAYS.THURSDAY,
  WORK_DAYS.FRIDAY,
  WORK_DAYS.SATURDAY,
  WORK_DAYS.SUNDAY,
];

/** Sieben Umschalter (aria-pressed), mobil als 7er-Raster. */
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

  return (
    <div className="space-y-2">
      {/* biome-ignore lint/a11y/useSemanticElements: Umschalter-Gruppe, kein Fieldset */}
      <div
        role="group"
        aria-label="Arbeitstage"
        className="grid grid-cols-7 gap-1.5 sm:flex sm:flex-wrap"
      >
        {ORDERED_DAYS.map((day) => {
          const active = value.includes(day);
          const label = WORK_DAY_LABELS[day];
          return (
            <button
              key={day}
              type="button"
              aria-pressed={active}
              aria-label={label}
              title={label}
              onClick={() => handleToggleDay(day)}
              className={cn(
                "inline-flex h-11 min-w-0 items-center justify-center rounded-md border text-sm transition-colors duration-[120ms] sm:h-9 sm:w-11",
                active
                  ? "border-primary bg-primary text-primary-foreground font-medium"
                  : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {label.slice(0, 2)}
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
