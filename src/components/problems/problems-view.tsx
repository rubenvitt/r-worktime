"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { closeRange, currentMonth } from "@/components/app/month";
import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { PeriodNav } from "@/components/app/period-nav";
import { invalidateEntryDependentQueries } from "@/components/app/query-invalidation";
import { RefetchBar, SkeletonRows } from "@/components/app/skeletons";
import { StickyActionBar } from "@/components/app/sticky-action-bar";
import { useMonthClose } from "@/components/app/use-month-close";
import {
  type ProblemDayDto,
  type ProblemsQuery,
  useProblems,
} from "@/components/app/use-problems";
import { useTrackingStart } from "@/components/app/use-tracking-start";
import { isoWeekOf, ProblemRow } from "@/components/problems/problem-row";
import { QuickEntryModal } from "@/components/problems/quick-entry-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { berlinTodayKey, shiftDateKey, shiftMonthKey } from "@/lib/dates";
import {
  formatDateShort,
  formatHours,
  formatMonth,
  hoursToMinutes,
  plural,
} from "@/lib/format";

import type { SickFillResult } from "@/services/sick-fill.service";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

/** Rückmeldung zu „Krankheit“: aufgefüllt, nach Timing übertragen? */
function sickFillMessage(result: SickFillResult): {
  text: string;
  warning: boolean;
} {
  if (!result.created) {
    return {
      text:
        result.reason === "full"
          ? "Tag als geprüft markiert – das Soll war schon erreicht."
          : "Tag als geprüft markiert – an diesem Tag gibt es kein Soll.",
      warning: false,
    };
  }
  const filled = `${formatHours(result.hours)} „Krank“ eingetragen`;
  switch (result.timing.status) {
    case "synced":
      return { text: `${filled} und in Timing übertragen.`, warning: false };
    case "local":
      return {
        text: `${filled} – nur lokal, kein Krank-Projekt für Timing gewählt.`,
        warning: false,
      };
    case "future":
      return {
        text: `${filled} – nur lokal, Timing nimmt keine Einträge in der Zukunft an.`,
        warning: true,
      };
    case "failed":
      return {
        text: `${filled}, aber nicht in Timing: ${result.timing.error}`,
        warning: true,
      };
  }
}

type Period = "month" | "90d" | "year";
type ProblemType = NonNullable<ProblemsQuery["problemType"]>;
type ReviewStatus = NonNullable<ProblemsQuery["reviewStatus"]>;
type SortBy = NonNullable<ProblemsQuery["sortBy"]>;

/** Trigger-Höhe: mobil 44 px, ab md 32 px (data-size schlägt sonst h-*) */
const TRIGGER = "data-[size=sm]:h-11 md:data-[size=sm]:h-8";

function formatKeyDate(key: string): string {
  return `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}`;
}

export function ProblemsView() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [month, setMonth] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [problemType, setProblemType] = useState<ProblemType>("all");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("unreviewed");
  const [sortBy, setSortBy] = useState<SortBy>("date_desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quickEntryDay, setQuickEntryDay] = useState<ProblemDayDto | null>(
    null,
  );

  // ?month= einmalig beim Mount übernehmen
  // biome-ignore lint/correctness/useExhaustiveDependencies: bewusst nur beim Mount
  useEffect(() => {
    const requested = searchParams.get("month");
    setMonth(
      requested && MONTH_PATTERN.test(requested) ? requested : currentMonth(),
    );
  }, []);

  const changeMonth = (next: string) => {
    setMonth(next);
    router.replace(`${pathname}?month=${next}`, { scroll: false });
  };

  const today = month ? berlinTodayKey() : null;
  const thisMonth = month ? currentMonth() : null;
  const tracking = useTrackingStart();

  const range = useMemo(() => {
    if (!month || !today) return null;
    if (period === "90d") {
      return { startDate: shiftDateKey(today, -90), endDate: today };
    }
    if (period === "year") {
      return { startDate: `${today.slice(0, 4)}-01-01`, endDate: today };
    }
    if (tracking.isLoading) return null;
    return closeRange(month, tracking.trackingStart);
  }, [month, today, period, tracking.isLoading, tracking.trackingStart]);

  const query = useProblems(
    range ? { ...range, problemType, reviewStatus, sortBy } : null,
  );

  // Laufender Tag: im Monatsmodus endet der Bereich gestern, daher separat
  const todayQuery = useProblems(
    today && period === "month" && month === thisMonth
      ? { startDate: today, endDate: today, reviewStatus: "all" }
      : null,
  );

  const allProblems = useMemo(() => query.data?.problems ?? [], [query.data]);
  const problems = useMemo(
    () => allProblems.filter((p) => p.date.slice(0, 10) !== today),
    [allProblems, today],
  );
  const todayProblem =
    allProblems.find((p) => p.date.slice(0, 10) === today) ??
    todayQuery.data?.problems.find((p) => p.date.slice(0, 10) === today) ??
    null;

  // Auswahl auf sichtbare Tage beschränken
  useEffect(() => {
    setSelected((current) => {
      const visible = new Set(problems.map((p) => p.date.slice(0, 10)));
      const next = new Set([...current].filter((key) => visible.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [problems]);

  const markAsReviewedMutation = useMutation({
    mutationFn: async ({ date, reason }: { date: string; reason?: string }) => {
      const response = await fetch("/api/problems/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, reason }),
      });
      if (!response.ok) throw new Error("Failed to mark as reviewed");
      return response.json() as Promise<{ sick?: SickFillResult[] }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["problems"] });
      const sick = data.sick?.[0];
      if (!sick) {
        toast.success("Tag als geprüft markiert");
        return;
      }
      invalidateEntryDependentQueries(queryClient);
      const message = sickFillMessage(sick);
      if (message.warning) toast.warning(message.text);
      else toast.success(message.text);
    },
    onError: () => {
      toast.error("Der Tag konnte nicht als geprüft markiert werden.");
    },
  });

  const bulkReviewMutation = useMutation({
    mutationFn: async ({
      dates,
      reason,
    }: {
      dates: string[];
      reason?: string;
    }) => {
      const response = await fetch("/api/problems/review", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dates, reason }),
      });
      if (!response.ok) throw new Error("Failed to mark as reviewed");
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["problems"] });
      setSelected(new Set());
      toast.success(
        `${plural(variables.dates.length, "Tag", "Tage")} als geprüft markiert`,
      );
    },
    onError: () => {
      toast.error("Die Tage konnten nicht als geprüft markiert werden.");
    },
  });

  // Querverweis auf fehlende Notizen (nur Monatsansicht)
  const monthClose = useMonthClose(month ?? currentMonth());
  const notesStep = monthClose.steps.find((step) => step.key === "notes");

  const counts = useMemo(
    () => ({
      total: problems.length,
      missing: problems.filter((p) => p.type === "missing").length,
      zero: problems.filter((p) => p.type === "zero_hours").length,
      incomplete: problems.filter((p) => p.type === "incomplete").length,
    }),
    [problems],
  );

  const scaleMinutes = useMemo(
    () =>
      Math.max(
        600,
        ...problems.map((p) =>
          Math.max(
            hoursToMinutes(p.currentHours),
            hoursToMinutes(p.expectedHours),
          ),
        ),
      ),
    [problems],
  );

  // Gruppen nach ISO-KW (bei Sortierung nach Art keine Gruppen)
  const groups = useMemo(() => {
    if (sortBy === "type") {
      return [{ key: "all", label: null as string | null, items: problems }];
    }
    const list: Array<{
      key: string;
      label: string | null;
      items: ProblemDayDto[];
    }> = [];
    for (const problem of problems) {
      const { year, week } = isoWeekOf(problem.date.slice(0, 10));
      const key = `${year}-${week}`;
      const last = list[list.length - 1];
      if (last && last.key === key) last.items.push(problem);
      else list.push({ key, label: `KW ${week}`, items: [problem] });
    }
    return list;
  }, [problems, sortBy]);

  const weekendHolidayDays = problems.filter(
    (p) => p.type === "missing" && (p.isWeekend || p.isHoliday),
  );

  if (!month || !today || !thisMonth) {
    return (
      <PageContainer>
        <PageHeader title="Probleme" />
        <Panel>
          <SkeletonRows count={6} height={44} />
        </Panel>
      </PageContainer>
    );
  }

  const monthLabel = formatMonth(month);
  const monthName = monthLabel.split(" ")[0];
  const loading = query.isLoading || (period === "month" && tracking.isLoading);
  const rangeEmpty = period === "month" && !tracking.isLoading && !range;

  const statusWord =
    reviewStatus === "reviewed"
      ? "geprüft"
      : reviewStatus === "all"
        ? ""
        : "offen";
  const metaParts = [
    `${plural(counts.total, "Tag", "Tage")}${statusWord ? ` ${statusWord}` : ""}`,
    counts.missing > 0 ? `${counts.missing} ohne Einträge` : null,
    counts.zero > 0 ? `${counts.zero} mit 0:00` : null,
    counts.incomplete > 0 ? `${counts.incomplete} unter Soll` : null,
  ].filter(Boolean);

  const meta = loading ? (
    <Skeleton className="h-4 w-56" />
  ) : query.data ? (
    <span>{metaParts.join(" · ")}</span>
  ) : null;

  const allSelected = problems.length > 0 && selected.size === problems.length;

  const toggleOne = (key: string, value: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });

  const actions = (
    <>
      <Select
        value={period}
        onValueChange={(value) => setPeriod(value as Period)}
      >
        <SelectTrigger size="sm" className={TRIGGER} aria-label="Zeitraum">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="month">Monat</SelectItem>
          <SelectItem value="90d">Letzte 90 Tage</SelectItem>
          <SelectItem value="year">Ganzes Jahr</SelectItem>
        </SelectContent>
      </Select>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 md:size-9"
            aria-label="Weitere Aktionen"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={
              weekendHolidayDays.length === 0 || bulkReviewMutation.isPending
            }
            onSelect={() =>
              bulkReviewMutation.mutate({
                dates: weekendHolidayDays.map((p) => p.date.slice(0, 10)),
                reason: "Wochenende/Feiertag",
              })
            }
          >
            Wochenenden und Feiertage ohne Einträge als geprüft markieren
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const toolbar = (
    <div className="flex min-w-max items-center gap-2 md:min-w-0 md:flex-wrap">
      <Select
        value={reviewStatus}
        onValueChange={(value) => setReviewStatus(value as ReviewStatus)}
      >
        <SelectTrigger size="sm" className={TRIGGER} aria-label="Prüfstatus">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unreviewed">Nicht geprüft</SelectItem>
          <SelectItem value="reviewed">Geprüft</SelectItem>
          <SelectItem value="all">Alle</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={problemType}
        onValueChange={(value) => setProblemType(value as ProblemType)}
      >
        <SelectTrigger size="sm" className={TRIGGER} aria-label="Art">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Arten</SelectItem>
          <SelectItem value="missing">Keine Einträge</SelectItem>
          <SelectItem value="zero_hours">0:00 erfasst</SelectItem>
          <SelectItem value="incomplete">Unter Soll</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={sortBy}
        onValueChange={(value) => setSortBy(value as SortBy)}
      >
        <SelectTrigger size="sm" className={TRIGGER} aria-label="Sortierung">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="date_desc">Neueste zuerst</SelectItem>
          <SelectItem value="date_asc">Älteste zuerst</SelectItem>
          <SelectItem value="type">Nach Art</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  let body: ReactNode;
  if (query.error) {
    body = (
      <ErrorState
        title="Probleme konnten nicht geladen werden"
        error={query.error}
        onRetry={() => query.refetch()}
      />
    );
  } else if (rangeEmpty) {
    body = (
      <Panel>
        <EmptyState
          title={`Noch keine abgeschlossenen Tage im ${monthName}.`}
        />
      </Panel>
    );
  } else if (loading || !query.data) {
    body = (
      <Panel>
        <SkeletonRows count={6} height={44} />
      </Panel>
    );
  } else if (problems.length === 0) {
    body = (
      <Panel>
        <EmptyState
          title={
            reviewStatus === "reviewed"
              ? "Noch keine geprüften Tage."
              : period === "month"
                ? `Keine offenen Tage im ${monthName}.`
                : "Keine offenen Tage in diesem Zeitraum."
          }
          action={
            reviewStatus === "reviewed" ? undefined : (
              <Button asChild variant="outline" size="sm">
                <Link href={`/timesheet?month=${month}`}>
                  Stundenzettel öffnen
                </Link>
              </Button>
            )
          }
        />
      </Panel>
    );
  } else {
    body = (
      <Panel aria-label="Offene Tage">
        <RefetchBar active={query.isFetching} />
        <div className="flex min-h-11 items-center gap-3 border-b px-4 text-[13px] text-muted-foreground md:min-h-9">
          <span className="-ml-3.5 flex size-11 items-center justify-center md:-ml-2 md:size-8">
            <Checkbox
              checked={
                allSelected ? true : selected.size > 0 ? "indeterminate" : false
              }
              onCheckedChange={(value) =>
                setSelected(
                  value === true
                    ? new Set(problems.map((p) => p.date.slice(0, 10)))
                    : new Set(),
                )
              }
              aria-label="Alle auswählen"
            />
          </span>
          <span>{allSelected ? "Alle ausgewählt" : "Alle auswählen"}</span>
        </div>
        {groups.map((group) => (
          <Fragment key={group.key}>
            {group.label ? (
              <div className="num border-b bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                {group.label}
              </div>
            ) : null}
            <ul className="divide-y border-b last:border-b-0">
              {group.items.map((problem) => {
                const key = problem.date.slice(0, 10);
                return (
                  <ProblemRow
                    key={key}
                    problem={problem}
                    scaleMinutes={scaleMinutes}
                    selected={selected.has(key)}
                    onSelectedChange={(value) => toggleOne(key, value)}
                    reviewPending={markAsReviewedMutation.isPending}
                    onMarkAsReviewed={(reason) =>
                      markAsReviewedMutation.mutate({ date: key, reason })
                    }
                    onOpenQuickEntry={() => setQuickEntryDay(problem)}
                  />
                );
              })}
            </ul>
          </Fragment>
        ))}
      </Panel>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Probleme"
        meta={meta}
        period={
          period === "month" ? (
            <PeriodNav
              label={monthLabel}
              prevLabel="Vorheriger Monat"
              nextLabel="Nächster Monat"
              onPrev={() => changeMonth(shiftMonthKey(month, -1))}
              onNext={() => changeMonth(shiftMonthKey(month, 1))}
              onToday={() => changeMonth(thisMonth)}
              isCurrent={month === thisMonth}
              nextDisabled={month >= thisMonth}
            />
          ) : undefined
        }
        actions={actions}
        toolbar={toolbar}
      />

      <div className="space-y-4">
        {period === "year" && tracking.adjustmentDate ? (
          <p className="text-[13px] text-muted-foreground">
            Tage vor dem {formatKeyDate(tracking.trackingStart ?? "")} zählen
            hier mit.
          </p>
        ) : null}

        {todayProblem ? (
          <p className="text-[13px] text-muted-foreground">
            Heute, {formatDateShort(today)} ·{" "}
            <span className="num">
              {formatHours(todayProblem.currentHours)} von{" "}
              {formatHours(todayProblem.expectedHours)}
            </span>{" "}
            · Läuft, zählt erst morgen
          </p>
        ) : null}

        {body}

        {period === "month" && notesStep?.status === "attention" ? (
          <p className="text-[13px] text-muted-foreground">
            Außerdem:{" "}
            <Link
              href={notesStep.href ?? `/timesheet?month=${month}`}
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              {notesStep.summary} im Stundenzettel
            </Link>
          </p>
        ) : null}
      </div>

      {quickEntryDay ? (
        <QuickEntryModal
          key={quickEntryDay.date}
          open
          onOpenChange={(open) => {
            if (!open) setQuickEntryDay(null);
          }}
          date={new Date(quickEntryDay.date)}
          suggestedHours={
            quickEntryDay.expectedHours - quickEntryDay.currentHours
          }
          onSuccess={() => {
            setQuickEntryDay(null);
            queryClient.invalidateQueries({ queryKey: ["problems"] });
          }}
        />
      ) : null}

      <StickyActionBar open={selected.size > 0}>
        <span className="text-sm">
          <span className="num">{selected.size}</span> ausgewählt
        </span>
        <Button
          type="button"
          variant="ghost"
          className="ml-auto h-11 md:h-9"
          onClick={() => setSelected(new Set())}
        >
          Auswahl aufheben
        </Button>
        <Button
          type="button"
          className="h-11 md:h-9"
          disabled={bulkReviewMutation.isPending}
          onClick={() =>
            bulkReviewMutation.mutate({ dates: [...selected].sort() })
          }
        >
          Als geprüft markieren
        </Button>
      </StickyActionBar>
    </PageContainer>
  );
}
