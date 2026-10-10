import type * as React from "react";
import { cn } from "@/lib/utils";

/** Seitenkopf mit genau einem h1. Darunter immer eine Trennlinie. */
export function PageHeader({
  title,
  description,
  meta,
  period,
  actions,
  toolbar,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  period?: React.ReactNode;
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
  className?: string;
}) {
  const hasSide = Boolean(period || actions);
  return (
    <header className={cn("mb-6 border-b pb-4", className)}>
      <div
        className={cn(
          "flex flex-col gap-3",
          hasSide && "lg:flex-row lg:items-start lg:justify-between lg:gap-6",
        )}
      >
        <div className="min-w-0 space-y-1">
          <h1 className="text-lg font-semibold tracking-[-0.01em] md:text-xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-prose text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
          {meta ? (
            <div className="text-[13px] text-muted-foreground">{meta}</div>
          ) : null}
        </div>
        {hasSide ? (
          <div className="flex flex-wrap items-center gap-2 md:gap-3 lg:shrink-0 lg:flex-nowrap">
            {period ? (
              <div className="min-w-[15rem] flex-1 md:w-auto md:min-w-0 md:flex-none">
                {period}
              </div>
            ) : null}
            {actions ? (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
        ) : null}
      </div>
      {toolbar ? (
        // Bis lg scrollt die Leiste in sich (mit Seitenleiste ist der Inhalt bei
        // md schmal). Das Polster gleicht das md:-mb-4 der Tab-Navigation aus,
        // damit der aktive Strich nicht abgeschnitten wird.
        <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:mx-0 md:-mb-[17px] md:px-0 md:pb-[17px] lg:mb-0 lg:overflow-visible lg:pb-0">
          {toolbar}
        </div>
      ) : null}
    </header>
  );
}
