"use client";

import {
  AlertCircle,
  CheckCircle2,
  History,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { PublicTimingSettings } from "@/lib/timing/settings";
import type { SyncStats } from "@/services/timing-sync.service";
import { useRunTimingSync, useTimingStatus } from "./use-timing";

function formatDateTime(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

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

function StatsList({ stats }: { stats: SyncStats }) {
  const skipped =
    stats.skipped.outsideRoots +
    stats.skipped.noProject +
    stats.skipped.running +
    stats.skipped.invalid;
  const rows: Array<[string, number | string]> = [
    ["Zeitraum", `${formatDateKey(stats.from)} – ${formatDateKey(stats.to)}`],
    ["Von Timing geladen", stats.fetched],
    ["Übernommen (passende Projekte)", stats.kept],
    ["Ausgelassen", skipped],
    ["Neu angelegt", stats.created],
    ["Aktualisiert", stats.updated],
    ["Unverändert", stats.unchanged],
    ["Gelöscht (in Timing entfernt)", stats.deleted],
    ["Datei-Importe ersetzt", stats.replacedFileImports],
    ["Konflikte mit manuellen Einträgen", stats.conflicts],
    ["Dauer", `${(stats.durationMs / 1000).toFixed(1)} s`],
  ];
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TimingSyncStatusCard({
  settings,
}: {
  settings: PublicTimingSettings;
}) {
  const { data: status, isLoading } = useTimingStatus();
  const sync = useRunTimingSync();
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toLocaleDateString("en-CA"));

  const running = sync.isPending || Boolean(status?.running);
  const canSync = settings.hasToken && settings.tokenReadable && !running;

  const runSync = (range?: { from: string; to: string }) => {
    sync.mutate(range, {
      onSuccess: (stats) =>
        toast.success(`Synchronisiert: ${summarize(stats)}`),
      onError: (error) => toast.error(error.message),
    });
  };

  const lastStats = isSyncStats(status?.lastSyncStats)
    ? status.lastSyncStats
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Synchronisierung
        </CardTitle>
        <CardDescription>
          Stoße den Abgleich von Hand an oder hol einen längeren Zeitraum nach.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Letzter Sync:</span>
              <span>{formatDateTime(status?.lastSyncAt ?? null)}</span>
              {running ? (
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  läuft
                </Badge>
              ) : status?.lastSyncStatus === "SUCCESS" ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  erfolgreich
                </Badge>
              ) : status?.lastSyncStatus === "FAILED" ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  fehlgeschlagen
                </Badge>
              ) : null}
            </div>
            {status?.nextSyncAt && (
              <p className="text-sm text-muted-foreground">
                Nächster automatischer Sync frühestens{" "}
                {formatDateTime(status.nextSyncAt)}
              </p>
            )}
            {status?.lastSyncStatus === "FAILED" && status.lastSyncError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{status.lastSyncError}</AlertDescription>
              </Alert>
            )}
            {lastStats && status?.lastSyncStatus === "SUCCESS" && (
              <StatsList stats={lastStats} />
            )}
          </div>
        )}

        <Button onClick={() => runSync()} disabled={!canSync}>
          {running ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Jetzt synchronisieren
        </Button>
        {!settings.hasToken && (
          <p className="text-sm text-muted-foreground">
            Hinterlege zuerst oben einen API-Key.
          </p>
        )}

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2 font-medium">
            <History className="h-4 w-4" />
            Zeitraum nachholen
          </div>
          <p className="text-sm text-muted-foreground">
            Gleicht einen beliebigen Zeitraum (bis rund 13 Monate) mit Timing
            ab, z. B. das ganze Jahr. Datei-Importe an Tagen mit Timing-Daten
            werden dabei ersetzt.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timing-backfill-from">Von</Label>
              <Input
                id="timing-backfill-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timing-backfill-to">Bis</Label>
              <Input
                id="timing-backfill-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => runSync({ from, to })}
            disabled={!canSync || !from || !to || from > to}
          >
            Zeitraum synchronisieren
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
