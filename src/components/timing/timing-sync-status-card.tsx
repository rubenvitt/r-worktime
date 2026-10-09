"use client";

import { CircleAlert, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { SkeletonPanel } from "@/components/app/skeletons";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import { StatusBadge } from "@/components/app/status-badge";
import {
  deriveSyncState,
  SYNC_STATE_LABEL,
  SYNC_STATE_TONE,
} from "@/components/app/sync-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRelative, formatSeconds, formatTimestamp } from "@/lib/format";
import type { PublicTimingSettings } from "@/lib/timing/settings";
import type { SyncStats } from "@/services/timing-sync.service";
import { type useRunTimingSync, useTimingStatus } from "./use-timing";

type RunTimingSync = ReturnType<typeof useRunTimingSync>;

function formatDateKey(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

function isSyncStats(value: unknown): value is SyncStats {
  return (
    typeof value === "object" &&
    value !== null &&
    "created" in value &&
    "from" in value
  );
}

function summarize(stats: SyncStats): string {
  const removed = stats.deleted + stats.replacedFileImports;
  return `${stats.created} neu, ${stats.updated} geändert, ${removed} entfernt`;
}

/** Startet einen Sync und meldet das Ergebnis als Toast. */
function runSync(sync: RunTimingSync, range?: { from: string; to: string }) {
  sync.mutate(range, {
    onSuccess: (stats) =>
      toast.success(`Sync abgeschlossen: ${summarize(stats)}`),
    onError: (error) => toast.error(error.message),
  });
}

/** Primäraktion im Seitenkopf. Teilt sich die Mutation mit der Statuskarte. */
export function TimingSyncNowButton({
  settings,
  sync,
}: {
  settings: PublicTimingSettings;
  sync: RunTimingSync;
}) {
  const { data: status } = useTimingStatus();
  const running = sync.isPending || Boolean(status?.running);
  const canSync = settings.hasToken && settings.tokenReadable && !running;

  return (
    <Button
      type="button"
      className="h-11 w-full sm:h-9 sm:w-auto"
      onClick={() => runSync(sync)}
      disabled={!canSync}
    >
      {running ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
      {running ? "Synchronisiere …" : "Jetzt synchronisieren"}
    </Button>
  );
}

function StatsDetails({ stats }: { stats: SyncStats }) {
  const skipped =
    stats.skipped.outsideRoots +
    stats.skipped.noProject +
    stats.skipped.running +
    stats.skipped.invalid;
  const rows: Array<[string, number | string]> = [
    ["Zeitraum", `${formatDateKey(stats.from)}–${formatDateKey(stats.to)}`],
    ["Von Timing geladen", stats.fetched],
    ["Übernommen (passende Projekte)", stats.kept],
    ["Ausgelassen", skipped],
    ["Neu angelegt", stats.created],
    ["Aktualisiert", stats.updated],
    ["Unverändert", stats.unchanged],
    ["Gelöscht (in Timing entfernt)", stats.deleted],
    ["Datei-Importe ersetzt", stats.replacedFileImports],
    ["Konflikte mit manuellen Einträgen", stats.conflicts],
    ["Dauer", formatSeconds(stats.durationMs)],
  ];
  return (
    <details className="group text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md font-medium text-muted-foreground hover:text-foreground sm:min-h-0">
        Alle Details
      </summary>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[13px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="num text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Status des letzten Syncs plus „Zeitraum nachholen“ in einem Panel. */
export function TimingSyncStatusCard({
  settings,
  sync,
  onConnect,
}: {
  settings: PublicTimingSettings;
  sync: RunTimingSync;
  /** Ohne API-Key: fokussiert das Eingabefeld der Verbindung */
  onConnect?: () => void;
}) {
  const { data: status, isLoading } = useTimingStatus();
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toLocaleDateString("en-CA"));

  const running = sync.isPending || Boolean(status?.running);
  const canSync = settings.hasToken && settings.tokenReadable && !running;

  if (!settings.hasToken) {
    return (
      <Panel aria-labelledby="timing-status-title">
        <PanelHeader title={<span id="timing-status-title">Status</span>} />
        <EmptyState
          title="Timing ist noch nicht verbunden."
          description="Hinterleg einen API-Key, dann übernimmt der Sync deine Zeiteinträge."
          action={
            onConnect ? (
              <Button
                type="button"
                className="h-11 w-full sm:h-9 sm:w-auto"
                onClick={onConnect}
              >
                API-Key einfügen
              </Button>
            ) : undefined
          }
        />
      </Panel>
    );
  }

  if (isLoading) {
    return <SkeletonPanel lines={4} />;
  }

  const state = deriveSyncState(
    status
      ? { ...status, running: status.running || sync.isPending }
      : undefined,
  );
  const lastStats = isSyncStats(status?.lastSyncStats)
    ? status.lastSyncStats
    : null;
  const lastSyncAt = status?.lastSyncAt ?? null;

  return (
    <Panel aria-labelledby="timing-status-title">
      <PanelHeader title={<span id="timing-status-title">Status</span>} />
      <PanelBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <StatusBadge tone={SYNC_STATE_TONE[state]}>
            {SYNC_STATE_LABEL[state]}
          </StatusBadge>
          {lastSyncAt ? (
            <span className="text-muted-foreground">
              Letzter Sync{" "}
              <time
                dateTime={lastSyncAt}
                title={formatTimestamp(lastSyncAt)}
                className="num text-foreground"
              >
                {formatRelative(lastSyncAt)}
              </time>
              <span className="num"> · {formatTimestamp(lastSyncAt)}</span>
            </span>
          ) : null}
        </div>

        {status?.lastSyncStatus === "FAILED" && status.lastSyncError ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Der letzte Sync ist fehlgeschlagen</AlertTitle>
            <AlertDescription>{status.lastSyncError}</AlertDescription>
          </Alert>
        ) : null}

        {lastStats && status?.lastSyncStatus === "SUCCESS" ? (
          <>
            <StatStrip>
              <Stat label="Neu" value={lastStats.created} />
              <Stat label="Aktualisiert" value={lastStats.updated} />
              <Stat label="Gelöscht" value={lastStats.deleted} />
              <Stat
                label="Konflikte"
                value={lastStats.conflicts}
                tone={lastStats.conflicts > 0 ? "warning" : "neutral"}
                hint={
                  lastStats.conflicts > 0
                    ? "mit manuellen Einträgen"
                    : undefined
                }
              />
            </StatStrip>
            <StatsDetails stats={lastStats} />
          </>
        ) : null}
      </PanelBody>

      <PanelBody className="space-y-4 border-t">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Zeitraum nachholen</h3>
          <p className="max-w-prose text-[13px] text-muted-foreground">
            Gleicht einen beliebigen Zeitraum mit Timing ab, bis rund 13 Monate,
            z. B. das ganze Jahr. Datei-Importe an Tagen mit Timing-Daten werden
            dabei ersetzt.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="timing-backfill-from">Von</Label>
            <Input
              id="timing-backfill-from"
              type="date"
              className="num w-full min-w-0"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="timing-backfill-to">Bis</Label>
            <Input
              id="timing-backfill-to"
              type="date"
              className="num w-full min-w-0"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:h-9 sm:w-auto"
          onClick={() => runSync(sync, { from, to })}
          disabled={!canSync || !from || !to || from > to}
        >
          Zeitraum synchronisieren
        </Button>
      </PanelBody>
    </Panel>
  );
}
