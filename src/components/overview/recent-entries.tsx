"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Duration } from "@/components/app/duration";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { SkeletonRows } from "@/components/app/skeletons";
import { EntryTypeBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { dateKeyFromDbDate } from "@/lib/dates";
import {
  formatDateShort,
  formatHoursDelta,
  formatTimeRange,
  hoursToMinutes,
} from "@/lib/format";
import { ENTRY_TYPE_LABEL, type EntryTypeKey } from "@/lib/labels";

interface RecentEntry {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  /** Prisma Decimal, kommt als String */
  duration: string | number;
  type: EntryTypeKey;
  description: string | null;
}

interface RecentEntriesResponse {
  entries: RecentEntry[];
  totalCount: number;
}

async function fetchRecentEntries(): Promise<RecentEntriesResponse> {
  const params = new URLSearchParams({
    limit: "8",
    sortBy: "date",
    sortOrder: "desc",
  });
  const response = await fetch(`/api/time-entries?${params}`);
  if (!response.ok) {
    throw new Error("Einträge konnten nicht geladen werden");
  }
  return response.json();
}

/** Die acht neuesten Zeiteinträge. */
export function RecentEntries({ className }: { className?: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard", "recent-entries"],
    queryFn: fetchRecentEntries,
    staleTime: 60 * 1000,
  });

  // Innerhalb eines Tages die spätesten zuerst
  const entries = [...(data?.entries ?? [])].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.startTime < b.startTime ? 1 : -1;
  });

  return (
    <Panel className={className}>
      <PanelHeader
        title="Letzte Einträge"
        actions={
          <Button asChild variant="ghost" size="sm" className="-mr-2">
            <Link href="/entries">Alle Einträge</Link>
          </Button>
        }
      />
      <PanelBody flush>
        {isLoading ? (
          <SkeletonRows count={6} />
        ) : error ? (
          <div className="p-4">
            <ErrorState
              title="Einträge konnten nicht geladen werden"
              error={error}
              onRetry={() => refetch()}
            />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            title="Noch keine Zeiten erfasst."
            description="Verbinde Timing, dann erscheinen deine Einträge hier."
            action={
              <Button asChild size="sm">
                <Link href="/settings/timing">Timing verbinden</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y">
            {entries.map((entry) => {
              const isAdjustment = entry.type === "OVERTIME";
              const hours = Number(entry.duration);
              const description =
                entry.description?.trim() ||
                (isAdjustment
                  ? ENTRY_TYPE_LABEL.OVERTIME
                  : "Ohne Beschreibung");
              return (
                <li
                  key={entry.id}
                  className="grid grid-cols-[7ch_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2 text-[13px] leading-[18px] sm:min-h-9 sm:grid-cols-[7ch_11ch_minmax(0,1fr)_auto] sm:py-1.5"
                >
                  <span>
                    {formatDateShort(dateKeyFromDbDate(new Date(entry.date)))}
                  </span>
                  <span className="num text-muted-foreground">
                    {isAdjustment
                      ? "—"
                      : formatTimeRange(entry.startTime, entry.endTime)}
                  </span>
                  <span className="col-span-3 row-start-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:row-start-auto">
                    <span
                      className={
                        entry.description
                          ? "truncate"
                          : "truncate text-muted-foreground"
                      }
                      title={entry.description ?? undefined}
                    >
                      {description}
                    </span>
                    <EntryTypeBadge type={entry.type} />
                  </span>
                  <span className="col-start-3 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
                    {isAdjustment ? (
                      <span className="num">{formatHoursDelta(hours)}</span>
                    ) : (
                      <Duration minutes={hoursToMinutes(hours)} />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
