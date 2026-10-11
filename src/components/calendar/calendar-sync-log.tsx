"use client";

import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Panel, PanelHeader } from "@/components/app/panel";
import { SkeletonRows } from "@/components/app/skeletons";
import { StatusBadge } from "@/components/app/status-badge";
import { formatRelative, formatTimestamp, plural } from "@/lib/format";
import type { CalendarSyncLog } from "./api-types";
import {
  actionLabel,
  actionTone,
  formatActionDate,
  kindLabel,
  sortActions,
  summarizeActions,
} from "./calendar-format";
import { CALENDAR_LOG_LIMIT, useCalendarLogs } from "./use-calendar";

function RunEntry({ log }: { log: CalendarSyncLog }) {
  const failed = log.status === "error";
  const summary = summarizeActions(log.actions);
  const actions = sortActions(log.actions);
  const expandable = actions.length > 0 || Boolean(log.error);

  const head = (
    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="flex items-center gap-2">
        <time
          dateTime={log.startedAt}
          title={formatTimestamp(log.startedAt)}
          className="num text-sm font-medium"
        >
          {formatRelative(log.startedAt)}
        </time>
        <StatusBadge tone={failed ? "negative" : "positive"}>
          {failed ? "Fehlgeschlagen" : "Erfolgreich"}
        </StatusBadge>
      </span>
      <span className="min-w-0 truncate text-[13px] text-muted-foreground">
        {summary || (failed ? "Nichts geändert" : "Keine Änderungen")}
      </span>
    </div>
  );

  if (!expandable) {
    return <li className="flex min-h-12 items-center px-4 py-2">{head}</li>;
  }

  return (
    <li>
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-[120ms] group-open:rotate-90"
            aria-hidden="true"
          />
          {head}
          <span className="sr-only">
            {plural(actions.length, "Aktion", "Aktionen")} anzeigen
          </span>
        </summary>
        <div className="space-y-2 px-4 pb-3 pl-10">
          {log.error ? (
            <p className="break-words text-[13px] text-destructive">
              {log.error}
            </p>
          ) : null}
          {actions.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {actions.map((action, index) => {
                const date = formatActionDate(action.date);
                const kind = kindLabel(action.kind);
                return (
                  <li
                    // Aktionen haben keine Id; die Reihenfolge je Lauf ist fest
                    key={index}
                    className="flex flex-col gap-1 px-3 py-2 text-[13px] sm:flex-row sm:items-baseline sm:gap-3"
                  >
                    <span className="num shrink-0 text-muted-foreground sm:w-32">
                      {date ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1 break-words">
                      <StatusBadge tone={actionTone(action.action)}>
                        {actionLabel(action.action)}
                      </StatusBadge>
                      {kind ? <span className="ml-2">{kind}</span> : null}
                      {action.detail ? (
                        <span className="block break-words text-muted-foreground sm:ml-2 sm:inline">
                          {action.detail}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </details>
    </li>
  );
}

/** Läufe mit ihren Aktionen, neueste zuerst; je Lauf aufklappbar. */
export function CalendarSyncLogList({ logs }: { logs: CalendarSyncLog[] }) {
  if (logs.length === 0) {
    return (
      <EmptyState
        title="Noch keine Läufe."
        description="Nach dem ersten Abgleich steht hier, was angelegt, verknüpft oder gelöscht wurde."
      />
    );
  }
  return (
    <ul className="divide-y">
      {logs.map((log) => (
        <RunEntry key={log.id} log={log} />
      ))}
    </ul>
  );
}

export function CalendarSyncLogPanel() {
  const logs = useCalendarLogs();

  return (
    <Panel aria-labelledby="calendar-log-title">
      <PanelHeader
        title={<span id="calendar-log-title">Protokoll</span>}
        meta={`letzte ${CALENDAR_LOG_LIMIT} Läufe`}
      />
      {logs.isPending ? (
        <SkeletonRows count={4} height={48} />
      ) : logs.isError ? (
        <div className="p-4">
          <ErrorState
            title="Protokoll konnte nicht geladen werden"
            error={logs.error}
            onRetry={() => logs.refetch()}
          />
        </div>
      ) : (
        <CalendarSyncLogList logs={logs.data} />
      )}
    </Panel>
  );
}
