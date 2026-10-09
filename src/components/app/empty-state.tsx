import type * as React from "react";
import { cn } from "@/lib/utils";

/** Leerzustand: linksbündig, ohne großes Icon, mit optionaler Aktion. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-10", className)}>
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
