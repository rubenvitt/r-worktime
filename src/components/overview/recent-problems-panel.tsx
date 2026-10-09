"use client";

import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { SkeletonRows } from "@/components/app/skeletons";
import { ProblemBadge } from "@/components/app/status-badge";
import { useProblems } from "@/components/app/use-problems";
import { Button } from "@/components/ui/button";
import { berlinTodayKey, shiftDateKey } from "@/lib/dates";
import { formatDateShort, formatHours } from "@/lib/format";

const MAX_ROWS = 5;

/** Offene Tage der letzten 7 Tage (bis gestern). */
export function RecentProblemsPanel({ className }: { className?: string }) {
  const today = berlinTodayKey();
  const { data, isLoading, error, refetch } = useProblems({
    startDate: shiftDateKey(today, -7),
    endDate: shiftDateKey(today, -1),
  });
  const problems = data?.problems ?? [];
  const total = data?.stats.totalProblems ?? 0;

  return (
    <Panel className={className}>
      <PanelHeader
        title="Letzte 7 Tage"
        meta={data && total > 0 ? `${total} offen` : undefined}
        actions={
          <Button asChild variant="ghost" size="sm" className="-mr-2">
            <Link href="/problems">Alle Probleme</Link>
          </Button>
        }
      />
      <PanelBody flush>
        {isLoading ? (
          <SkeletonRows count={3} height={44} />
        ) : error ? (
          <div className="p-4">
            <ErrorState
              title="Probleme konnten nicht geladen werden"
              error={error}
              onRetry={() => refetch()}
            />
          </div>
        ) : problems.length === 0 ? (
          <EmptyState
            className="py-6"
            title="Keine offenen Tage."
            description="Alle Tage der letzten Woche sind erfasst oder geprüft."
          />
        ) : (
          <ul className="divide-y">
            {problems.slice(0, MAX_ROWS).map((problem) => (
              <li
                key={problem.date}
                className="flex h-11 items-center gap-3 px-4 text-[13px] leading-[18px]"
              >
                <span className="w-[7ch] shrink-0">
                  {formatDateShort(problem.date)}
                </span>
                <ProblemBadge type={problem.type} />
                <span className="num ml-auto whitespace-nowrap text-muted-foreground">
                  <span className="text-foreground">
                    {formatHours(problem.currentHours)}
                  </span>{" "}
                  von {formatHours(problem.expectedHours)}
                </span>
              </li>
            ))}
            {problems.length > MAX_ROWS ? (
              <li className="px-4 py-2.5 text-xs text-muted-foreground">
                {`und ${problems.length - MAX_ROWS} weitere`}
              </li>
            ) : null}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
