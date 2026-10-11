"use client";

import { CircleAlert, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { PublicCalendarSettings } from "@/lib/calendar/types";
import { formatRelative, formatTimestamp } from "@/lib/format";
import {
  CALENDAR_SYNC_STATE_LABEL,
  CALENDAR_SYNC_STATE_TONE,
  deriveCalendarSyncState,
  statsRows,
  summarizeActions,
} from "./calendar-format";
import { isConflict, type useRunCalendarSync } from "./use-calendar";

type RunCalendarSync = ReturnType<typeof useRunCalendarSync>;

/** Startet einen Abgleich und meldet das Ergebnis als Toast. */
function runSync(sync: RunCalendarSync) {
  sync.mutate(undefined, {
    onSuccess: (result) => {
      if (result.status === "error") {
        toast.error("Abgleich fehlgeschlagen", {
          description: result.error ?? undefined,
        });
        return;
      }
      toast.success("Abgleich abgeschlossen", {
        description: summarizeActions(result.actions) || "Keine Änderungen",
      });
    },
    onError: (error) => {
      if (isConflict(error)) {
        toast.info("Ein Abgleich läuft bereits");
        return;
      }
      toast.error(error.message);
    },
  });
}

function CalendarSyncNowButton({
  settings,
  sync,
}: {
  settings: PublicCalendarSettings;
  sync: RunCalendarSync;
}) {
  return (
    <Button
      type="button"
      className="h-11 w-full sm:h-9 sm:w-auto"
      onClick={() => runSync(sync)}
      disabled={!settings.configured || sync.isPending}
    >
      {sync.isPending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
      {sync.isPending ? "Gleiche ab …" : "Jetzt abgleichen"}
    </Button>
  );
}

export function CalendarSyncStatusCard({
  settings,
  sync,
  onConfigure,
}: {
  settings: PublicCalendarSettings;
  sync: RunCalendarSync;
  /** Ohne Feed: springt zum Eingabefeld */
  onConfigure?: () => void;
}) {
  if (!settings.configured) {
    return (
      <Panel aria-labelledby="calendar-status-title">
        <PanelHeader title={<span id="calendar-status-title">Status</span>} />
        <EmptyState
          title="Noch kein Kalender-Feed hinterlegt."
          description="Hinterleg die Feed-Adresse aus Timewarp, dann übernimmt der Abgleich deine Abwesenheiten."
          action={
            onConfigure ? (
              <Button
                type="button"
                className="h-11 w-full sm:h-9 sm:w-auto"
                onClick={onConfigure}
              >
                Feed-Adresse einfügen
              </Button>
            ) : undefined
          }
        />
      </Panel>
    );
  }

  const state = deriveCalendarSyncState(settings, sync.isPending);
  const stats = statsRows(settings.lastSyncStats);

  return (
    <Panel aria-labelledby="calendar-status-title">
      <PanelHeader title={<span id="calendar-status-title">Status</span>} />
      <PanelBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <StatusBadge tone={CALENDAR_SYNC_STATE_TONE[state]}>
            {CALENDAR_SYNC_STATE_LABEL[state]}
          </StatusBadge>
          {settings.lastSyncAt ? (
            <span className="text-muted-foreground">
              Letzter Abgleich{" "}
              <time
                dateTime={settings.lastSyncAt}
                title={formatTimestamp(settings.lastSyncAt)}
                className="num text-foreground"
              >
                {formatRelative(settings.lastSyncAt)}
              </time>
              <span className="num">
                {" "}
                · {formatTimestamp(settings.lastSyncAt)}
              </span>
            </span>
          ) : null}
        </div>

        {!settings.syncEnabled ? (
          <p className="text-[13px] text-muted-foreground">
            Der automatische Abgleich ist aus; abgeglichen wird nur auf
            Knopfdruck.
          </p>
        ) : null}

        {settings.lastSyncStatus === "error" && settings.lastSyncError ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Der letzte Abgleich ist fehlgeschlagen</AlertTitle>
            <AlertDescription className="break-words">
              {settings.lastSyncError}
            </AlertDescription>
          </Alert>
        ) : null}

        {stats.length > 0 ? (
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[13px]">
            {stats.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="num text-right">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <CalendarSyncNowButton settings={settings} sync={sync} />
      </PanelBody>
    </Panel>
  );
}
