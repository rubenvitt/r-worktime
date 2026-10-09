"use client";

import { Check, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { toast } from "sonner";
import { Panel, PanelHeader } from "@/components/app/panel";
import {
  type MonthCloseStep,
  type StepStatus,
  useMonthClose,
} from "@/components/app/use-month-close";
import { useRunTimingSync } from "@/components/timing/use-timing";
import { Button } from "@/components/ui/button";
import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<StepStatus, string> = {
  done: "erledigt",
  attention: "offen",
  blocked: "blockiert",
  pending: "ausstehend",
  loading: "wird geprüft",
};

function StepMarker({ status, index }: { status: StepStatus; index: number }) {
  const base =
    "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold num";
  let marker: React.ReactNode;
  if (status === "done") {
    marker = (
      <span className={cn(base, "bg-positive-muted text-positive")}>
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  } else if (status === "attention") {
    marker = (
      <span className={cn(base, "bg-warning-muted text-warning")}>!</span>
    );
  } else if (status === "blocked") {
    marker = (
      <span className={cn(base, "bg-negative-muted text-negative")}>!</span>
    );
  } else if (status === "loading") {
    marker = (
      <span className={cn(base, "text-muted-foreground")}>
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    );
  } else {
    marker = (
      <span className={cn(base, "border text-muted-foreground")}>
        {index + 1}
      </span>
    );
  }
  return (
    <>
      <span aria-hidden="true">{marker}</span>
      <span className="sr-only">{`Schritt ${index + 1}, ${STATUS_TEXT[status]}:`}</span>
    </>
  );
}

function SyncAction({ state }: { state: StepStatus }) {
  const runSync = useRunTimingSync();
  const busy = state === "loading" || runSync.isPending;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-11 md:h-8"
      disabled={busy}
      onClick={() =>
        runSync.mutate(undefined, {
          onSuccess: () => toast.success("Sync abgeschlossen"),
          onError: (error) =>
            toast.error(
              error instanceof Error ? error.message : "Sync fehlgeschlagen",
            ),
        })
      }
    >
      {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {busy ? "Synchronisiere …" : "Jetzt synchronisieren"}
    </Button>
  );
}

function StepLink({ href, children }: { href: string; children: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="h-11 md:h-8">
      <Link href={href}>{children}</Link>
    </Button>
  );
}

/**
 * Monatsabschluss in vier Schritten. `full` im Stundenzettel mit Aktionen,
 * `compact` auf der Übersicht mit Links.
 */
export function MonthClosePanel({
  month,
  variant,
  notesCriticalDays,
  onShowMissingNotes,
  transferAction,
  className,
}: {
  month: string;
  variant: "full" | "compact";
  notesCriticalDays?: number;
  onShowMissingNotes?: () => void;
  transferAction?: React.ReactNode;
  className?: string;
}) {
  const { steps, doneCount } = useMonthClose(month, { notesCriticalDays });
  const activeIndex = steps.findIndex((s) => s.status !== "done");
  const title = `Monatsabschluss ${formatMonth(month)}`;
  const meta = `${doneCount} von ${steps.length} erledigt`;

  if (variant === "compact") {
    return (
      <Panel className={className}>
        <PanelHeader title={title} meta={meta} />
        <ol aria-label="Schritte Monatsabschluss" className="divide-y">
          {steps.map((step, index) => (
            <li
              key={step.key}
              aria-current={index === activeIndex ? "step" : undefined}
              className="flex min-h-11 items-center gap-3 px-4 py-1.5"
            >
              <StepMarker status={step.status} index={index} />
              <div
                className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-[18px]"
                title={step.detail}
              >
                <span className="text-muted-foreground">{step.title}</span>{" "}
                {step.summary}
              </div>
              {compactLink(step)}
            </li>
          ))}
        </ol>
      </Panel>
    );
  }

  return (
    <Panel className={className}>
      <PanelHeader title={title} meta={meta} />
      <ol aria-label="Schritte Monatsabschluss" className="divide-y">
        {steps.map((step, index) => (
          <li
            key={step.key}
            aria-current={index === activeIndex ? "step" : undefined}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 md:flex-nowrap",
              index === activeIndex && "bg-accent/40",
            )}
          >
            <StepMarker status={step.status} index={index} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="w-24 shrink-0 text-sm font-medium">
                  {step.title}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {step.summary}
                </span>
              </div>
              {step.detail ? (
                <p className="mt-1 max-w-prose break-words text-xs text-destructive">
                  {step.detail}
                </p>
              ) : null}
            </div>
            <div className="ml-8 flex basis-full items-center empty:hidden md:ml-0 md:basis-auto md:shrink-0">
              {fullAction(step, { onShowMissingNotes, transferAction })}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function compactLink(step: MonthCloseStep): React.ReactNode {
  if (!step.href) return null;
  if (step.key === "transfer") {
    return <StepLink href={step.href}>Stundenzettel</StepLink>;
  }
  if (step.status === "done" || step.status === "loading") return null;
  return (
    <StepLink href={step.href}>
      {step.key === "problems" ? "Klären" : "Öffnen"}
    </StepLink>
  );
}

function fullAction(
  step: MonthCloseStep,
  options: {
    onShowMissingNotes?: () => void;
    transferAction?: React.ReactNode;
  },
): React.ReactNode {
  switch (step.key) {
    case "sync":
      // href nur, wenn Timing nicht verbunden bzw. der Status fehlt
      if (step.href) return <StepLink href={step.href}>Einrichten</StepLink>;
      return <SyncAction state={step.status} />;
    case "problems":
      if (step.status === "done" || !step.href) return null;
      return <StepLink href={step.href}>Klären</StepLink>;
    case "notes":
      if (step.status === "done") return null;
      if (options.onShowMissingNotes) {
        return (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 md:h-8"
            onClick={options.onShowMissingNotes}
          >
            Nur diese zeigen
          </Button>
        );
      }
      return step.href ? <StepLink href={step.href}>Öffnen</StepLink> : null;
    case "transfer":
      return options.transferAction ?? null;
    default:
      return null;
  }
}
