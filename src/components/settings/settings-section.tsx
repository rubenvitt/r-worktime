import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Abschnitt einer Einstellungsseite: h2, Trennlinie oben, keine eigene Karte.
 * Der erste Abschnitt direkt unter dem PageHeader setzt `first`.
 */
export function SettingsSection({
  id,
  title,
  description,
  first,
  className,
  children,
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  first?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("min-w-0 space-y-4", !first && "border-t pt-6", className)}
    >
      <div className="space-y-1">
        <h2 id={headingId} className="text-sm font-semibold">
          {title}
        </h2>
        {description ? (
          <p className="max-w-prose text-[13px] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
