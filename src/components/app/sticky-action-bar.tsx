import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Leiste für Auswahl- und Speicheraktionen am unteren Rand.
 * Sitzt mobil über der Tab-Leiste (var(--app-bottom-inset)).
 */
export function StickyActionBar({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div
      className={cn(
        "sticky bottom-[var(--app-bottom-inset)] z-30 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
