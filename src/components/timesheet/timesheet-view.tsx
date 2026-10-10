"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Download,
  ExternalLink,
  FileJson,
  Loader2,
  MoreHorizontal,
  RotateCw,
  Send,
  TriangleAlert,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { FilterChips } from "@/components/app/filter-chips";
import { closeRange, currentMonth } from "@/components/app/month";
import { MonthClosePanel } from "@/components/app/month-close-panel";
import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { PeriodNav } from "@/components/app/period-nav";
import {
  RefetchBar,
  SkeletonPanel,
  SkeletonRows,
} from "@/components/app/skeletons";
import { StickyActionBar } from "@/components/app/sticky-action-bar";
import {
  DEFAULT_TIMESHEET_PREFS,
  loadTimesheetPrefs,
  saveTimesheetPrefs,
  type TimesheetPrefs,
  timesheetQueryString,
} from "@/components/app/timesheet-prefs";
import { type ProblemDayDto, useProblems } from "@/components/app/use-problems";
import { useTrackingStart } from "@/components/app/use-tracking-start";
import { QuickEntryModal } from "@/components/problems/quick-entry-modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useOdooExtension } from "@/hooks/use-odoo-extension";
import { shiftMonthKey } from "@/lib/dates";
import { formatMonth, plural } from "@/lib/format";
import { resolveTravel } from "@/lib/reports/travel";
import {
  isRounding,
  ROUNDING_OPTIONS,
  type TimesheetEntry,
} from "@/lib/timesheet/aggregate";
import {
  ackErrorMessage,
  validateTimesheetPayload,
} from "@/lib/timesheet/extension-protocol";
import type {
  TimesheetDayView,
  TimesheetResponse,
} from "@/lib/timesheet/types";
import { cn } from "@/lib/utils";
import { GapRow } from "./gap-row";
import { formatDayLabel, TimesheetDayCard } from "./timesheet-day-card";
import {
  travelDecisionFor,
  useLegacyTravelImport,
  useTravelDecision,
} from "./use-travel-days";

const EXTENSION_DOCS_URL =
  "https://github.com/rubenvitt/r-worktime/tree/main/extension#readme";
const ALL_ROOTS = "__all__";
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

type DayFilter = "all" | "missing-notes" | "travel";

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} kopiert`);
  } catch {
    toast.error(
      "Kopieren nicht möglich – erlaube den Zugriff auf die Zwischenablage.",
    );
  }
}

export function TimesheetView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<TimesheetPrefs>(DEFAULT_TIMESHEET_PREFS);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DayFilter>("all");
  const [gapDay, setGapDay] = useState<ProblemDayDto | null>(null);
  const extension = useOdooExtension();
  const travelDecision = useTravelDecision();
  // frühere Korrekturen aus dem localStorage einmalig in die DB übernehmen
  useLegacyTravelImport();

  // localStorage und Query-Parameter erst nach dem Mount lesen (einmalig,
  // kein Hydration-Mismatch). Spätere Wechsel schreibt die Seite per replace.
  // biome-ignore lint/correctness/useExhaustiveDependencies: bewusst nur beim Mount
  useEffect(() => {
    setPrefs(loadTimesheetPrefs());
    const requested = searchParams.get("month");
    setMonth(
      requested && MONTH_PATTERN.test(requested) ? requested : currentMonth(),
    );
    if (searchParams.get("filter") === "missing-notes") {
      setFilter("missing-notes");
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Fehler beim Monatswechsel verwerfen
  useEffect(() => {
    setSendError(null);
  }, [month]);

  const changeMonth = useCallback(
    (next: string) => {
      setMonth(next);
      router.replace(`${pathname}?month=${next}`, { scroll: false });
    },
    [pathname, router],
  );

  const updatePrefs = useCallback((patch: Partial<TimesheetPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      saveTimesheetPrefs(next);
      return next;
    });
  }, []);

  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } =
    useQuery<TimesheetResponse>({
      queryKey: ["timesheet", month, prefs],
      enabled: month !== null,
      placeholderData: (previous) => previous,
      queryFn: async () => {
        const response = await fetch(
          `/api/timesheet?${timesheetQueryString(month ?? "", prefs)}`,
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            body?.error ?? "Stundenzettel konnte nicht geladen werden",
          );
        }
        return body as TimesheetResponse;
      },
    });

  const days = useMemo(
    () => (data && data.month === month ? data.days : []),
    [data, month],
  );

  // Effektiver Wert wie im Server-Payload: Festlegung, sonst Vorschlag
  const travelFeeFor = useCallback(
    (day: Pick<TimesheetDayView, "travelFee" | "travelOverride">) =>
      resolveTravel(day.travelFee, day.travelOverride).isTravel,
    [],
  );

  const payload: TimesheetEntry[] = useMemo(
    () =>
      days.map((day) => ({
        date: day.date,
        hours: day.hours,
        text: day.text,
        travelFee: travelFeeFor(day),
      })),
    [days, travelFeeFor],
  );

  const issues = useMemo(
    () =>
      month && payload.length > 0
        ? validateTimesheetPayload({
            month,
            generatedAt: "",
            entries: payload,
          })
        : [],
    [month, payload],
  );

  // Umschalten speichert eine Festlegung, solange der Wert vom Vorschlag
  // abweicht; zurück auf den Vorschlag entfernt sie (auch über „Vorschlag“)
  const setTravelFee = (date: string, isTravel: boolean | null) =>
    travelDecision.mutate({ date, isTravel });

  const handleSend = async () => {
    if (!month || isPlaceholderData) return;
    if (issues.length > 0) {
      toast.error("Der Stundenzettel kann so nicht gesendet werden.", {
        description: issues[0].message,
      });
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const result = await extension.send(month, payload);
      if (result.ok) {
        toast.success(`${result.count} Tage an die Odoo-Extension übergeben.`, {
          description:
            "Öffne den Stundenzettel in Odoo und klicke dort auf „eintragen“.",
        });
      } else {
        const message = ackErrorMessage(result.error);
        toast.error(message);
        setSendError(message);
      }
    } finally {
      setSending(false);
    }
  };

  const handleCopyJson = () =>
    copyToClipboard(JSON.stringify(payload, null, 2), "JSON");

  // Lückenzeilen: Tage ohne Einträge im Prüfbereich (nur Anzeige)
  const tracking = useTrackingStart();
  const gapRange =
    month && !tracking.isLoading
      ? closeRange(month, tracking.trackingStart)
      : null;
  const gapsQuery = useProblems(
    gapRange
      ? { ...gapRange, problemType: "missing", sortBy: "date_asc" }
      : null,
  );
  const hasGapRange = gapRange !== null;
  const gaps = useMemo(
    () => (hasGapRange ? (gapsQuery.data?.problems ?? []) : []),
    [hasGapRange, gapsQuery.data],
  );

  const roots = useMemo(() => {
    const list = data?.availableRoots ?? [];
    return prefs.root && !list.includes(prefs.root)
      ? [prefs.root, ...list]
      : list;
  }, [data?.availableRoots, prefs.root]);

  const monthLoaded = Boolean(data && data.month === month);
  const travelDays = payload.filter((p) => p.travelFee).length;
  const criticalDays = days.filter((d) => d.criticalCount > 0).length;
  const exportHref = month
    ? `/api/timesheet/timing-export?${timesheetQueryString(month, prefs, false)}`
    : undefined;

  const extensionPresent = extension.status === "present";
  const primaryDisabled = extensionPresent
    ? payload.length === 0 || sending || isPlaceholderData
    : payload.length === 0 || isPlaceholderData;
  const handlePrimary = extensionPresent ? handleSend : handleCopyJson;

  // Gleicher Handler überall; nur der Kopf (und mobil die Leiste) ist primär
  const primaryButton = (
    className?: string,
    variant: "default" | "outline" = "default",
  ) => (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={primaryDisabled}
      onClick={handlePrimary}
    >
      {extensionPresent ? (
        sending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Send />
        )
      ) : (
        <FileJson />
      )}
      {extensionPresent ? "An Odoo senden" : "JSON kopieren"}
    </Button>
  );

  // Liste: Tage (gefiltert) und Lückenzeilen chronologisch gemischt
  const visibleDays = useMemo(() => {
    if (filter === "missing-notes")
      return days.filter((d) => d.criticalCount > 0);
    if (filter === "travel") return days.filter((d) => travelFeeFor(d));
    return days;
  }, [days, filter, travelFeeFor]);

  const rows = useMemo(() => {
    type Row =
      | { kind: "day"; key: string; day: (typeof days)[number] }
      | { kind: "gap"; key: string; problem: ProblemDayDto };
    const list: Row[] = visibleDays.map((day) => ({
      kind: "day",
      key: day.date,
      day,
    }));
    if (filter === "all" && monthLoaded) {
      const dayKeys = new Set(days.map((d) => d.date));
      for (const problem of gaps) {
        const key = problem.date.slice(0, 10);
        // nur Tage mit Soll (keine Wochenenden/Feiertage)
        if (!dayKeys.has(key) && problem.expectedHours > 0) {
          list.push({ kind: "gap", key, problem });
        }
      }
      list.sort((a, b) => a.key.localeCompare(b.key));
    }
    return list;
  }, [visibleDays, filter, monthLoaded, days, gaps]);

  if (month === null) {
    return (
      <PageContainer>
        <PageHeader title="Stundenzettel" />
        <div className="space-y-6">
          <SkeletonPanel lines={4} />
          <Panel>
            <SkeletonRows count={6} height={56} />
          </Panel>
        </div>
      </PageContainer>
    );
  }

  const monthLabel = formatMonth(month);
  const meta = monthLoaded && data && (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="num text-[32px] leading-9 font-semibold tracking-[-0.02em] text-foreground">
        {data.totals.hours}
      </span>
      <span>
        gerundet · {plural(data.totals.days, "Tag", "Tage")} ·{" "}
        {plural(data.totals.entries, "Eintrag", "Einträge")} · Dienstreise an{" "}
        {plural(travelDays, "Tag", "Tagen")}
      </span>
    </div>
  );

  const toolbar = (
    <div className="flex min-w-max flex-wrap items-center gap-x-5 gap-y-2 md:min-w-0">
      <div className="flex items-center gap-2">
        <Label
          htmlFor="timesheet-root"
          className="text-[13px] font-normal text-muted-foreground"
        >
          Projekt
        </Label>
        <Select
          value={prefs.root ?? ALL_ROOTS}
          onValueChange={(value) =>
            updatePrefs({ root: value === ALL_ROOTS ? null : value })
          }
        >
          <SelectTrigger
            id="timesheet-root"
            size="sm"
            className="max-w-[16rem] data-[size=sm]:h-11 md:data-[size=sm]:h-8"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ROOTS}>Alle Arbeitseinträge</SelectItem>
            {roots.map((root) => (
              <SelectItem key={root} value={root}>
                {root}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label
          htmlFor="timesheet-rounding"
          className="text-[13px] font-normal text-muted-foreground"
        >
          Rundung
        </Label>
        <Select
          value={String(prefs.rounding)}
          onValueChange={(value) => {
            const rounding = Number(value);
            if (isRounding(rounding)) updatePrefs({ rounding });
          }}
        >
          <SelectTrigger
            id="timesheet-rounding"
            size="sm"
            className="data-[size=sm]:h-11 md:data-[size=sm]:h-8"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROUNDING_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option} Min.
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="timesheet-absences"
          checked={prefs.includeAbsences}
          onCheckedChange={(checked) =>
            updatePrefs({ includeAbsences: checked })
          }
        />
        <Label
          htmlFor="timesheet-absences"
          className="min-h-11 text-[13px] font-normal md:min-h-0"
        >
          Abwesenheiten einbeziehen
        </Label>
      </div>
    </div>
  );

  const actions = (
    <>
      {primaryButton()}
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
          {extensionPresent ? (
            <DropdownMenuItem
              disabled={payload.length === 0 || isPlaceholderData}
              onSelect={() => handleCopyJson()}
            >
              <FileJson />
              JSON kopieren
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild disabled={!exportHref}>
            <a href={exportHref} download>
              <Download />
              Rohdaten (Timing-JSON) herunterladen
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={EXTENSION_DOCS_URL} target="_blank" rel="noreferrer">
              <ExternalLink />
              Odoo-Extension einrichten
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const showList = !isLoading && !error && days.length > 0;

  return (
    <PageContainer>
      <PageHeader
        title="Stundenzettel"
        meta={meta}
        period={
          <PeriodNav
            label={monthLabel}
            prevLabel="Vorheriger Monat"
            nextLabel="Nächster Monat"
            onPrev={() => changeMonth(shiftMonthKey(month, -1))}
            onNext={() => changeMonth(shiftMonthKey(month, 1))}
            onToday={() => changeMonth(currentMonth())}
            isCurrent={month === currentMonth()}
          >
            <Input
              id="timesheet-month"
              type="month"
              aria-label="Monat"
              value={month}
              className="num h-11 w-full max-w-[12rem] text-center md:h-8 md:w-[11rem]"
              onChange={(event) => {
                if (MONTH_PATTERN.test(event.target.value)) {
                  changeMonth(event.target.value);
                }
              }}
            />
          </PeriodNav>
        }
        actions={actions}
        toolbar={toolbar}
      />

      <div className="space-y-6">
        <div className="space-y-3">
          <MonthClosePanel
            month={month}
            variant="full"
            notesCriticalDays={
              monthLoaded && !isPlaceholderData ? criticalDays : undefined
            }
            onShowMissingNotes={() => setFilter("missing-notes")}
            transferAction={primaryButton("h-11 md:h-8", "outline")}
          />

          {issues.length > 0 ? (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle>So nimmt die Extension den Monat nicht an</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {issues.map((issue, index) => (
                    <li key={`${issue.date ?? "all"}-${index}`}>
                      {issue.date ? `${formatDayLabel(issue.date)}: ` : ""}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {sendError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>
                Senden an die Odoo-Extension fehlgeschlagen
              </AlertTitle>
              <AlertDescription>
                <p className="text-foreground/80">{sendError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={primaryDisabled}
                  onClick={handleSend}
                >
                  <RotateCw />
                  Erneut senden
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        {showList ? (
          <FilterChips
            ariaLabel="Tage filtern"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Alle", count: days.length },
              {
                value: "missing-notes",
                label: "Ohne Notiz",
                count: criticalDays,
              },
              { value: "travel", label: "Dienstreise", count: travelDays },
            ]}
          />
        ) : null}

        {error ? (
          <ErrorState
            title="Stundenzettel konnte nicht geladen werden"
            error={error}
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <Panel>
            <SkeletonRows count={6} height={56} />
          </Panel>
        ) : days.length === 0 ? (
          <Panel>
            <EmptyState
              title={
                prefs.root
                  ? `Keine Einträge im ${monthLabel} im Projekt ‚${prefs.root}‘.`
                  : `Keine Einträge im ${monthLabel}.`
              }
            />
          </Panel>
        ) : (
          <Panel aria-label={`Tage im ${monthLabel}`}>
            <RefetchBar active={isFetching} />
            {rows.length === 0 ? (
              <EmptyState
                title={
                  filter === "missing-notes"
                    ? "Alle Tage haben eine Notiz."
                    : "Kein Tag als Dienstreise markiert."
                }
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFilter("all")}
                  >
                    Alle Tage zeigen
                  </Button>
                }
              />
            ) : (
              <ul
                className={cn(
                  "divide-y transition-opacity",
                  isPlaceholderData && "opacity-60",
                )}
              >
                {rows.map((row) => (
                  <Fragment key={`${row.kind}-${row.key}`}>
                    {row.kind === "day" ? (
                      <TimesheetDayCard
                        day={row.day}
                        travelFee={travelFeeFor(row.day)}
                        onTravelFeeChange={(value) =>
                          setTravelFee(
                            row.day.date,
                            travelDecisionFor(row.day.travelFee, value),
                          )
                        }
                        onTravelFeeReset={() =>
                          setTravelFee(row.day.date, null)
                        }
                        onCopy={copyToClipboard}
                        copyDisabled={isPlaceholderData}
                      />
                    ) : (
                      <GapRow
                        date={row.key}
                        onAdd={() => setGapDay(row.problem)}
                      />
                    )}
                  </Fragment>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      {gapDay ? (
        <QuickEntryModal
          key={gapDay.date}
          open
          onOpenChange={(open) => {
            if (!open) setGapDay(null);
          }}
          date={new Date(gapDay.date)}
          suggestedHours={Math.max(
            0,
            gapDay.expectedHours - gapDay.currentHours,
          )}
          onSuccess={() => {
            setGapDay(null);
            queryClient.invalidateQueries({ queryKey: ["problems"] });
            queryClient.invalidateQueries({ queryKey: ["timesheet"] });
          }}
        />
      ) : null}

      <StickyActionBar open={payload.length > 0} className="md:hidden">
        {primaryButton("h-11 w-full")}
      </StickyActionBar>
    </PageContainer>
  );
}
