"use client";

import { useMutationState, useQuery } from "@tanstack/react-query";
import {
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Download,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { FilterChips } from "@/components/app/filter-chips";
import { Panel, PanelFooter, PanelHeader } from "@/components/app/panel";
import {
  RefetchBar,
  SkeletonPanel,
  SkeletonRows,
  SkeletonStatStrip,
} from "@/components/app/skeletons";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import { downloadCsv } from "@/components/reports/download-csv";
import { fetchJson } from "@/components/reports/fetch-json";
import { ReportHeader } from "@/components/reports/report-header";
import { ReportYearNav } from "@/components/reports/report-period-nav";
import { useReportYear } from "@/components/reports/use-report-params";
import {
  TRAVEL_DECISION_KEY,
  type TravelDecisionInput,
  useLegacyTravelImport,
  useTravelDecision,
} from "@/components/timesheet/use-travel-days";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isDateKey } from "@/lib/dates";
import { formatDuration, formatMonth, plural } from "@/lib/format";
import {
  buildTravelCsv,
  type TravelReport as TravelReportData,
  type TravelReportRow,
} from "@/lib/reports/travel";
import { cn } from "@/lib/utils";
import { TravelDayRow } from "./travel-day-row";

type Filter = "all" | "open" | "decided";

export function TravelReport() {
  const {
    year,
    setYear: changeYear,
    currentYear,
    maxYear,
  } = useReportYear({ maxOffset: 1 });

  const [filter, setFilter] = useState<Filter>("all");
  const [showRejected, setShowRejected] = useState(false);
  const [newDate, setNewDate] = useState("");
  const decision = useTravelDecision();
  // alte Browser-Korrekturen auch übernehmen, wenn der Bericht zuerst geöffnet wird
  useLegacyTravelImport();

  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } =
    useQuery<TravelReportData>({
      queryKey: ["travel-report", year],
      placeholderData: (previous) => previous,
      queryFn: () =>
        fetchJson<TravelReportData>(
          `/api/travel-days/report?year=${year}`,
          "Reisetage konnten nicht geladen werden",
        ),
    });

  const pendingDates = useMutationState({
    filters: { mutationKey: TRAVEL_DECISION_KEY, status: "pending" },
    select: (mutation) =>
      (mutation.state.variables as TravelDecisionInput | undefined)?.date,
  });
  const pending = useMemo(() => new Set(pendingDates), [pendingDates]);

  const report = data && data.year === year ? data : null;

  const visibleDays = useMemo(() => {
    const days = report?.days ?? [];
    if (filter === "open") return days.filter((d) => d.status === "suggested");
    if (filter === "decided")
      return days.filter((d) => d.status !== "suggested");
    return days;
  }, [report, filter]);

  const byMonth = useMemo(() => {
    const groups = new Map<string, TravelReportRow[]>();
    for (const row of visibleDays) {
      const month = row.date.slice(0, 7);
      const list = groups.get(month) ?? [];
      list.push(row);
      groups.set(month, list);
    }
    return Array.from(groups.entries());
  }, [visibleDays]);

  const decide = (date: string, isTravel: boolean | null) =>
    decision.mutate({ date, isTravel });

  const confirmAllOpen = async () => {
    const open = (report?.days ?? []).filter((d) => d.status === "suggested");
    const results = await Promise.allSettled(
      open.map((row) =>
        decision.mutateAsync({ date: row.date, isTravel: true }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      toast.success(
        `${plural(open.length, "Reisetag", "Reisetage")} bestätigt`,
      );
    }
  };

  const addDay = () => {
    if (!isDateKey(newDate)) return;
    decision.mutate(
      { date: newDate, isTravel: true },
      {
        onSuccess: () => {
          toast.success("Reisetag festgelegt");
          setNewDate("");
          const target = Number(newDate.slice(0, 4));
          if (target !== year) changeYear(target);
        },
      },
    );
  };

  const header = (
    <ReportHeader
      report="travel"
      period={
        <ReportYearNav
          year={year}
          currentYear={currentYear}
          maxYear={maxYear}
          onChange={changeYear}
        />
      }
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 md:h-8"
          disabled={!report || report.days.length === 0}
          onClick={() =>
            report &&
            downloadCsv(
              buildTravelCsv(report.days),
              `reisetage-${report.year}.csv`,
            )
          }
        >
          <Download />
          CSV
        </Button>
      }
    />
  );

  if (error && !report) {
    return (
      <>
        {header}
        <ErrorState
          title="Reisetage konnten nicht geladen werden"
          error={error}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  if (isLoading || !report) {
    return (
      <>
        {header}
        <div className="space-y-6">
          <SkeletonStatStrip tiles={4} />
          <SkeletonPanel lines={3} />
          <Panel>
            <SkeletonRows count={6} height={52} />
          </Panel>
        </div>
      </>
    );
  }

  const { totals } = report;
  const isEmpty = report.days.length === 0 && report.rejected.length === 0;

  return (
    <>
      {header}

      <div
        className={cn(
          "space-y-6 transition-opacity",
          isPlaceholderData && "opacity-60",
        )}
      >
        <StatStrip>
          <Stat
            label="Reisetage"
            value={totals.days}
            emphasis
            hint={
              totals.days > 0
                ? `${totals.confirmed} bestätigt · ${totals.added} manuell · ${totals.open} offen`
                : `im Jahr ${year}`
            }
          />
          <Stat
            label="Stunden an Reisetagen"
            value={formatDuration(totals.minutes)}
            hint="ungerundet"
          />
          <Stat
            label="Offene Vorschläge"
            value={totals.open}
            tone={totals.open > 0 ? "warning" : "neutral"}
            hint={totals.open > 0 ? "noch nicht bestätigt" : "alles geprüft"}
          />
          <Stat
            label="Abgelehnt"
            value={totals.rejected}
            hint="Vorschläge, die nicht zählen"
          />
        </StatStrip>

        <p className="max-w-prose text-[13px] text-muted-foreground">
          Vorschläge kommen aus Schlüsselwörtern wie „Präsenztag“, „vor Ort“
          oder „Dienstreise“ in Titel und Notizen. Gezählt werden
          Arbeitseinträge wie im{" "}
          <Link href="/timesheet" className="underline underline-offset-2">
            Stundenzettel
          </Link>{" "}
          – ohne Saldo-Korrekturen und ohne Projektfilter; aufgefüllte Tage
          zählen mit ihrer eingetragenen Dauer.
        </p>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0 space-y-4">
            {isEmpty ? (
              <Panel>
                <EmptyState
                  title={`Keine Reisetage im Jahr ${year}.`}
                  description="Sobald ein Eintrag ein Schlüsselwort enthält, erscheint der Tag hier als Vorschlag. Tage ohne Einträge kannst du rechts direkt festlegen."
                />
              </Panel>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FilterChips
                    ariaLabel="Reisetage filtern"
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: "all", label: "Alle", count: totals.days },
                      { value: "open", label: "Offen", count: totals.open },
                      {
                        value: "decided",
                        label: "Festgelegt",
                        count: totals.confirmed + totals.added,
                      },
                    ]}
                  />
                  {totals.open > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11 md:h-8"
                      disabled={pending.size > 0}
                      onClick={confirmAllOpen}
                    >
                      <CheckCheck />
                      Alle offenen bestätigen
                    </Button>
                  ) : null}
                </div>

                {byMonth.length === 0 ? (
                  <Panel>
                    <EmptyState
                      title={
                        filter === "open"
                          ? "Keine offenen Vorschläge."
                          : "Noch nichts festgelegt."
                      }
                      action={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setFilter("all")}
                        >
                          Alle Reisetage zeigen
                        </Button>
                      }
                    />
                  </Panel>
                ) : (
                  byMonth.map(([month, rows]) => {
                    const minutes = rows.reduce((s, r) => s + r.minutes, 0);
                    return (
                      <Panel key={month} aria-label={formatMonth(month)}>
                        <RefetchBar active={isFetching} />
                        <PanelHeader
                          title={formatMonth(month)}
                          meta={
                            <span className="num">
                              {plural(rows.length, "Tag", "Tage")} ·{" "}
                              {formatDuration(minutes)}
                            </span>
                          }
                        />
                        <ul className="divide-y">
                          {rows.map((row) => (
                            <TravelDayRow
                              key={row.date}
                              row={row}
                              pending={pending.has(row.date)}
                              onDecide={(value) => decide(row.date, value)}
                            />
                          ))}
                        </ul>
                      </Panel>
                    );
                  })
                )}

                {report.rejected.length > 0 ? (
                  <Panel>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold hover:bg-accent"
                      aria-expanded={showRejected}
                      aria-controls="travel-rejected"
                      onClick={() => setShowRejected((v) => !v)}
                    >
                      {showRejected ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                      Abgelehnte Vorschläge
                      <span className="num text-xs font-normal text-muted-foreground">
                        {report.rejected.length}
                      </span>
                    </button>
                    {showRejected ? (
                      <ul id="travel-rejected" className="divide-y border-t">
                        {report.rejected.map((row) => (
                          <TravelDayRow
                            key={row.date}
                            row={row}
                            pending={pending.has(row.date)}
                            onDecide={(value) => decide(row.date, value)}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </Panel>
                ) : null}
              </>
            )}
          </div>

          <aside className="min-w-0 space-y-4">
            <Panel aria-label={`Monatssummen ${year}`}>
              <PanelHeader title="Monatssummen" />
              <table className="w-full text-[13px]">
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Monat</th>
                    <th scope="col">Tage</th>
                    <th scope="col">Stunden</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.months.map((m) => (
                    <tr
                      key={m.month}
                      className={cn(m.days === 0 && "text-muted-foreground")}
                    >
                      <th
                        scope="row"
                        className="px-4 py-1.5 text-left font-normal"
                      >
                        {formatMonth(m.month).split(" ")[0]}
                      </th>
                      <td className="num px-2 py-1.5 text-right">{m.days}</td>
                      <td className="num px-4 py-1.5 text-right">
                        {formatDuration(m.minutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PanelFooter className="flex items-center justify-between text-[13px] font-semibold">
                <span>Jahr {year}</span>
                <span className="num">
                  {plural(totals.days, "Tag", "Tage")} ·{" "}
                  {formatDuration(totals.minutes)}
                </span>
              </PanelFooter>
            </Panel>

            <Panel>
              <PanelHeader title="Reisetag festlegen" />
              <form
                className="space-y-2 p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  addDay();
                }}
              >
                <Label
                  htmlFor="travel-new-date"
                  className="text-[13px] font-normal text-muted-foreground"
                >
                  Für Tage ohne Vorschlag, z. B. reine Anreise.
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="travel-new-date"
                    type="date"
                    value={newDate}
                    onChange={(event) => setNewDate(event.target.value)}
                    className="num h-11 min-w-0 flex-1 md:h-8"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-11 md:h-8"
                    disabled={!isDateKey(newDate) || pending.has(newDate)}
                  >
                    <Plus />
                    Festlegen
                  </Button>
                </div>
              </form>
            </Panel>
          </aside>
        </div>
      </div>
    </>
  );
}
