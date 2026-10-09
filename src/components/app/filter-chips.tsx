"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Einfachauswahl als Chip-Reihe (aria-pressed). */
export function FilterChips<T extends string>({
  value,
  onChange,
  ariaLabel,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  options: Array<{ value: T; label: string; count?: number }>;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: Chip-Gruppe, kein Formular-Fieldset
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-11 shadow-none md:h-8",
              active
                ? "border-foreground/20 bg-accent font-medium text-foreground"
                : "font-normal text-muted-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="num text-muted-foreground">{option.count}</span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
