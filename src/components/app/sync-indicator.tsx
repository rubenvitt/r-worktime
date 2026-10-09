"use client";

import Link from "next/link";
import type { Tone } from "@/components/app/status-badge";
import {
  deriveSyncState,
  SYNC_STATE_LABEL,
  SYNC_STATE_TONE,
  type SyncState,
} from "@/components/app/sync-state";
import { useTimingStatus } from "@/components/timing/use-timing";
import { formatRelative, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

const DOT: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  positive: "bg-positive",
  negative: "bg-negative",
  warning: "bg-warning",
  info: "bg-info",
};

function compactText(state: SyncState, lastSyncAt: string | null): string {
  if ((state === "ok" || state === "stale") && lastSyncAt) {
    return `Sync ${formatRelative(lastSyncAt)}`;
  }
  if (state === "failed") return "Sync fehlgeschlagen";
  return SYNC_STATE_LABEL[state];
}

/** Sync-Status als Punkt (+ Text) mit Link auf /settings/timing. */
export function SyncIndicator({
  variant,
  className,
}: {
  variant: "compact" | "dot";
  className?: string;
}) {
  const { data, isLoading, isError } = useTimingStatus();
  const state: SyncState | null =
    isLoading || isError ? null : deriveSyncState(data);
  const tone = state ? SYNC_STATE_TONE[state] : "neutral";
  const lastSyncAt = data?.lastSyncAt ?? null;
  const title = lastSyncAt
    ? `Letzter Sync: ${formatTimestamp(lastSyncAt)}`
    : state
      ? SYNC_STATE_LABEL[state]
      : "Sync-Status wird geladen";

  const dot = (
    <span className="relative flex size-1.5 shrink-0" aria-hidden="true">
      {state === "running" ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            DOT[tone],
          )}
        />
      ) : null}
      <span
        className={cn("relative inline-flex size-1.5 rounded-full", DOT[tone])}
      />
    </span>
  );

  if (variant === "dot") {
    const label = state
      ? `Sync-Status: ${SYNC_STATE_LABEL[state]}${lastSyncAt ? `, ${formatRelative(lastSyncAt)}` : ""}`
      : "Sync-Status wird geladen";
    return (
      <Link
        href="/settings/timing"
        aria-label={label}
        title={title}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-md hover:bg-accent",
          className,
        )}
      >
        <span className="scale-[1.35]">{dot}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/settings/timing"
      title={title}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-[120ms] hover:bg-sidebar-accent hover:text-foreground",
        className,
      )}
    >
      {dot}
      <span className="truncate">
        {state ? compactText(state, lastSyncAt) : "Sync …"}
      </span>
    </Link>
  );
}
