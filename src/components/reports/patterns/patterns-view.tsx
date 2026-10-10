"use client";

import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Panel, PanelHeader } from "@/components/app/panel";
import {
  RefetchBar,
  SkeletonPanel,
  SkeletonStatStrip,
} from "@/components/app/skeletons";
import { fetchJson } from "@/components/reports/fetch-json";
import { ReportHeader } from "@/components/reports/report-header";
import {
  PeriodKindChips,
  ReportPeriodNav,
} from "@/components/reports/report-period-nav";
import { useReportPeriod } from "@/components/reports/use-report-params";
import { formatDateShort, plural } from "@/lib/format";
import {
  LAST90_OPTION,
  MIN_GAP_MINUTES,
  NIGHT_GAP_MINUTES,
  type PatternPeriod,
  type PatternsResponse,
  parsePatternPeriod,
  patternPeriodParams,
  switchPatternPeriod,
} from "@/lib/reports/patterns";
import { ArbzgPanel } from "./arbzg-panel";
import { DayTimeline } from "./day-timeline";
import { DistributionChart } from "./distribution-chart";
import { PatternsHeatmap } from "./patterns-heatmap";
import { ExtremesList, PatternsSummary } from "./patterns-summary";
import { WeekdayTable } from "./weekday-table";

/** Skelett für Suspense und erstes Laden. */
export function PatternsSkeleton() {
  return (
    <>
      <SkeletonStatStrip tiles={5} />
      <SkeletonPanel lines={7} />
      <div className="grid gap-6 md:grid-cols-2">
        <SkeletonPanel lines={4} />
        <SkeletonPanel lines={4} />
      </div>
    </>
  );
}

export function PatternsView() {
  const {
    period: reportPeriod,
    setPeriod,
    todayKey,
    searchParams,
    update,
  } = useReportPeriod();
  // „90 Tage“ ergänzt die gemeinsamen Zeiträume nur in diesem Bericht
  const period: PatternPeriod =
    parsePatternPeriod(searchParams) ?? reportPeriod;
  const queryString = patternPeriodParams(period).toString();

  const changePeriod = (next: PatternPeriod) => {
    if (next.kind === "last90") update({ period: "last90", key: null });
    else setPeriod(next);
  };

  const { data, isLoading, isFetching, error, refetch } =
    useQuery<PatternsResponse>({
      queryKey: ["reports", "patterns", queryString],
      placeholderData: (previous) => previous,
      staleTime: 60 * 1000,
      queryFn: () =>
        fetchJson<PatternsResponse>(
          `/api/reports/patterns?${queryString}`,
          "Arbeitszeitmuster konnten nicht geladen werden",
        ),
    });

  return (
    <>
      <ReportHeader
        report="patterns"
        period={
          period.kind === "last90" ? (
            <div className="flex h-11 items-center justify-center text-sm font-medium md:h-8">
              Letzte 90 Tage
            </div>
          ) : (
            <ReportPeriodNav
              period={period}
              todayKey={todayKey}
              onChange={changePeriod}
            />
          )
        }
        actions={
          <PeriodKindChips
            value={period.kind}
            onChange={(kind) =>
              changePeriod(switchPatternPeriod(period, kind, todayKey))
            }
            extraOptions={[LAST90_OPTION]}
          />
        }
      />
      <div className="space-y-6">
        <RefetchBar active={isFetching && !isLoading} />
        {isLoading ? (
          <PatternsSkeleton />
        ) : error && !data ? (
          <ErrorState
            title="Arbeitszeitmuster konnten nicht geladen werden"
            error={error}
            onRetry={() => refetch()}
          />
        ) : data ? (
          <PatternsContent data={data} />
        ) : null}
      </div>
    </>
  );
}

function ScopeNote({ data }: { data: PatternsResponse }) {
  const parts: string[] = [];
  if (data.range.effectiveTo < data.range.to) {
    parts.push(
      `ausgewertet bis ${formatDateShort(data.range.effectiveTo)} (der laufende Tag zählt noch nicht)`,
    );
  }
  const excluded: string[] = [];
  if (data.excluded.bulkFillDays > 0) {
    excluded.push(
      `${plural(data.excluded.bulkFillDays, "aufgefüllter Tag", "aufgefüllte Tage")} mit festen Uhrzeiten`,
    );
  }
  if (data.excluded.adjustmentEntries > 0) {
    excluded.push("der Anfangs-Saldo");
  }
  if (data.excluded.invalidEntries > 0) {
    excluded.push(
      plural(
        data.excluded.invalidEntries,
        "Eintrag ohne Dauer",
        "Einträge ohne Dauer",
      ),
    );
  }
  return (
    <p className="text-[13px] text-muted-foreground">
      Nur echte Arbeitseinträge; Urlaub, Krankheit und Feiertage zählen nicht.
      Arbeit vor 4 Uhr gehört zum Vortag, wenn sie nach weniger als{" "}
      {NIGHT_GAP_MINUTES / 60} Stunden an dessen Arbeit anschließt; Lücken unter{" "}
      {MIN_GAP_MINUTES} Minuten sind keine Pause.
      {excluded.length > 0
        ? ` Nicht berücksichtigt: ${excluded.join(", ")}.`
        : ""}
      {parts.length > 0 ? ` Zeitraum ${parts.join("; ")}.` : ""}
    </p>
  );
}

function PatternsContent({ data }: { data: PatternsResponse }) {
  if (data.range.isEmpty) {
    return (
      <Panel>
        <EmptyState
          title="Noch keine abgeschlossenen Tage"
          description="Dieser Zeitraum liegt in der Zukunft oder hat gerade erst begonnen. Ausgewertet wird bis einschließlich gestern."
        />
      </Panel>
    );
  }

  const { summary } = data;
  if (!summary) {
    return (
      <div className="space-y-3">
        <Panel>
          <EmptyState
            title="Keine Arbeitszeiten im Zeitraum"
            description={
              data.excluded.bulkFillDays > 0
                ? `Es gibt nur ${plural(data.excluded.bulkFillDays, "aufgefüllten Tag", "aufgefüllte Tage")} mit festen Uhrzeiten – die sagen über deine echten Arbeitszeiten nichts aus.`
                : "Für diesen Zeitraum sind keine Arbeitseinträge erfasst."
            }
          />
        </Panel>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <PatternsSummary summary={summary} findingDays={data.findingDays} />
        <ScopeNote data={data} />
      </div>

      <Panel>
        <PanelHeader title="Wann du arbeitest" meta="Wochentag × Uhrzeit" />
        <div className="p-4">
          <PatternsHeatmap rows={data.heatmap} />
        </div>
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Arbeitsbeginn"
            meta={`Verteilung in ${data.histogram.bucketMinutes}-Minuten-Schritten`}
          />
          <div className="p-4">
            <DistributionChart
              buckets={data.histogram.start}
              bucketMinutes={data.histogram.bucketMinutes}
              medianMinute={summary.medianStartMinute}
              noun="begonnen"
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="Arbeitsende"
            meta={`Verteilung in ${data.histogram.bucketMinutes}-Minuten-Schritten`}
          />
          <div className="p-4">
            <DistributionChart
              buckets={data.histogram.end}
              bucketMinutes={data.histogram.bucketMinutes}
              medianMinute={summary.medianEndMinute}
              noun="beendet"
            />
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Nach Wochentag" />
          <WeekdayTable weekdays={data.weekdays} />
        </Panel>
        <Panel>
          <PanelHeader title="Extreme" />
          <ExtremesList summary={summary} />
        </Panel>
      </div>

      <div id="arbzg" className="scroll-mt-20">
        <ArbzgPanel
          findings={data.findings}
          counts={data.findingCounts}
          findingDays={data.findingDays}
          workDays={summary.days}
          hasHolidays={data.holidayCount > 0}
        />
      </div>

      <Panel>
        <PanelHeader
          title="Tagesverlauf"
          meta="Arbeitsblöcke je Tag, neueste zuerst"
        />
        <DayTimeline days={data.days} />
      </Panel>
    </>
  );
}
