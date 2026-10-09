import type * as React from "react";
import { cn } from "@/lib/utils";

/** Fläche für einen Abschnitt: Rand, Kartenfarbe, kein Schatten. */
export function Panel({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-clip rounded-lg border bg-card text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2",
        className,
      )}
    >
      <h2 className="min-w-0 truncate text-sm font-semibold">{title}</h2>
      {meta ? (
        <div className="text-xs text-muted-foreground">{meta}</div>
      ) : null}
      {actions ? (
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function PanelBody({
  flush,
  className,
  children,
}: {
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(flush ? "p-0" : "p-4", className)}>{children}</div>;
}

export function PanelFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("border-t px-4 py-3", className)}>{children}</div>;
}
