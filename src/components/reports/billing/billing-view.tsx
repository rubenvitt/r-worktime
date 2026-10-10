"use client";

import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { Duration } from "@/components/app/duration";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { FilterChips } from "@/components/app/filter-chips";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import {
  RefetchBar,
  SkeletonPanel,
  SkeletonStatStrip,
} from "@/components/app/skeletons";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import { fetchJson } from "@/components/reports/fetch-json";
import { ReportHeader } from "@/components/reports/report-header";
import {
  PeriodKindChips,
  ReportPeriodNav,
} from "@/components/reports/report-period-nav";
import { useReportPeriod } from "@/components/reports/use-report-params";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatPercent } from "@/lib/format";
import type { BillingReport } from "@/lib/reports/billing";
import {
  convertPeriod,
  periodLabel,
  periodMonths,
  periodSearchParams,
} from "@/lib/reports/period";
import { BillingShareBar, BillingStatusList } from "./billing-status-list";
import { BillingTrendChart } from "./billing-trend-chart";

const DEPTH_OPTIONS = ["1", "2", "3"] as const;
type DepthOption = (typeof DEPTH_OPTIONS)[number];

/** Skelett für Suspense und erstes Laden. */
export function BillingSkeleton() {
  return (
    <>
      <SkeletonStatStrip tiles={4} />
      <SkeletonPanel lines={6} />
      <SkeletonPanel lines={4} />
    </>
  );
}

export function BillingView() {
  const { period, setPeriod, todayKey, searchParams, update } =
    useReportPeriod();
  const rawDepth = searchParams.get("depth");
  const depth: DepthOption = DEPTH_OPTIONS.includes(rawDepth as DepthOption)
    ? (rawDepth as DepthOption)
    : "1";
  const label = periodLabel(period);

  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } =
    useQuery<BillingReport>({
      queryKey: ["reports", "billing", period.kind, period.key, depth],
      placeholderData: (previous) => previous,
      queryFn: () => {
        const params = periodSearchParams(period);
        params.set("depth", depth);
        return fetchJson<BillingReport>(
          `/api/reports/billing?${params}`,
          "Abrechnungsbericht konnte nicht geladen werden",
        );
      },
    });

  const trendHasData = useMemo(
    () => data?.trend.some((point) => point.totalMinutes > 0) ?? false,
    [data],
  );

  const header = (
    <ReportHeader
      report="billing"
      period={
        <ReportPeriodNav
          period={period}
          todayKey={todayKey}
          onChange={setPeriod}
        />
      }
      actions={
        <PeriodKindChips
          value={period.kind}
          onChange={(kind) => setPeriod(convertPeriod(period, kind, todayKey))}
        />
      }
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <div className="space-y-6">
          <BillingSkeleton />
        </div>
      </>
    );
  }

  if (error && !data) {
    return (
      <>
        {header}
        <ErrorState
          title="Abrechnungsbericht konnte nicht geladen werden"
          error={error}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  if (!data) return header;

  const { totals } = data;
  const empty = totals.totalMinutes === 0;

  return (
    <>
      {header}
      <div className="space-y-6">
        <RefetchBar active={isFetching && isPlaceholderData} />

        {error ? (
          <ErrorState
            title="Aktualisieren fehlgeschlagen"
            error={error}
            onRetry={() => refetch()}
          />
        ) : null}

        {data.showUnknownHint ? (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>
              {formatPercent(totals.unknownShare)} der Arbeitszeit ohne Status
            </AlertTitle>
            <AlertDescription>
              <p>
                Für <Duration minutes={totals.unknownMinutes} /> liegt kein
                Abrechnungsstatus aus Timing vor. Die Quote ist dadurch nur
                bedingt aussagekräftig – unter den Einträgen mit Status liegt
                sie bei {formatPercent(totals.classifiedShare)}.
                {totals.bulkFillMinutes > 0 ? (
                  <>
                    {" "}
                    <Duration minutes={totals.bulkFillMinutes} /> davon stammen
                    aus dem Auffüllen.
                  </>
                ) : null}
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        {empty ? (
          <Panel>
            <EmptyState
              title={`Keine Arbeitszeit in ${label}`}
              description="Für diesen Zeitraum gibt es keine Arbeitseinträge. Wähle einen anderen Zeitraum oder synchronisiere Timing."
            />
          </Panel>
        ) : (
          <>
            <StatStrip>
              <Stat
                emphasis
                label="Abrechenbar-Quote"
                value={formatPercent(totals.billableShare)}
                hint={
                  <>
                    <Duration minutes={totals.billableMinutes} /> von{" "}
                    <Duration minutes={totals.totalMinutes} />
                  </>
                }
              />
              <Stat
                label="Abrechenbar"
                value={<Duration minutes={totals.billableMinutes} />}
                hint="Offen, abgerechnet, bezahlt"
              />
              <Stat
                label="Nicht abrechenbar"
                value={<Duration minutes={totals.nonBillableMinutes} />}
                hint={formatPercent(
                  totals.totalMinutes > 0
                    ? totals.nonBillableMinutes / totals.totalMinutes
                    : null,
                )}
              />
              <Stat
                label="Ohne Status"
                value={<Duration minutes={totals.unknownMinutes} />}
                hint={formatPercent(totals.unknownShare)}
                tone={data.showUnknownHint ? "warning" : "neutral"}
              />
            </StatStrip>

            <Panel>
              <PanelHeader
                title="Nach Status"
                meta={`${totals.entryCount} ${
                  totals.entryCount === 1 ? "Eintrag" : "Einträge"
                }`}
                actions={
                  <FilterChips
                    ariaLabel="Projektebene"
                    value={depth}
                    onChange={(next) =>
                      update({ depth: next === "1" ? null : next })
                    }
                    options={DEPTH_OPTIONS.map((value) => ({
                      value,
                      label: `Ebene ${value}`,
                    }))}
                  />
                }
              />
              <PanelBody className="border-b">
                <BillingShareBar
                  statuses={data.statuses}
                  totalMinutes={totals.totalMinutes}
                />
              </PanelBody>
              <BillingStatusList
                statuses={data.statuses}
                bulkFillMinutes={totals.bulkFillMinutes}
              />
            </Panel>
          </>
        )}

        <Panel>
          <PanelHeader
            title="Quote im Verlauf"
            meta="12 Monate, abrechenbar von gesamt"
          />
          <PanelBody>
            {trendHasData ? (
              <BillingTrendChart
                points={data.trend}
                periodMonths={periodMonths(period)}
              />
            ) : (
              <p className="text-[13px] text-muted-foreground">
                In den zwölf Monaten bis {label} gibt es keine Arbeitszeit.
              </p>
            )}
          </PanelBody>
        </Panel>

        <p className="max-w-prose text-xs text-muted-foreground">
          Es zählen nur Arbeitseinträge (Arbeit und Überstunden). Urlaub,
          Krankheit, Feiertage und der Anfangssaldo bleiben außen vor, auch wenn
          sie einen Status tragen. Aufgefüllte Tage haben keinen Status.
          Einträge zählen zum Berliner Kalendertag ihres Starts.
        </p>
      </div>
    </>
  );
}
