"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import {
  RefetchBar,
  SkeletonPanel,
  SkeletonStatStrip,
} from "@/components/app/skeletons";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import { downloadCsv } from "@/components/reports/download-csv";
import { fetchJson } from "@/components/reports/fetch-json";
import { ReportHeader } from "@/components/reports/report-header";
import {
  PeriodKindChips,
  ReportPeriodNav,
} from "@/components/reports/report-period-nav";
import { useReportPeriod } from "@/components/reports/use-report-params";
import { Button } from "@/components/ui/button";
import { formatDuration, formatMonth } from "@/lib/format";
import {
  convertPeriod,
  periodPhrase,
  periodSearchParams,
} from "@/lib/reports/period";
import {
  findFocusLevel,
  formatShare,
  type ProjectsReportResponse,
  periodFileName,
  projectTreeToCsv,
} from "@/lib/reports/projects";
import { PROJECT_PATH_SEPARATOR } from "@/lib/timing/project-path";
import { ProjectTree } from "./project-tree";
import { ProjectTrendChart } from "./project-trend-chart";

/** Skelett für Suspense und erstes Laden. */
export function ProjectsSkeleton() {
  return (
    <>
      <SkeletonStatStrip tiles={3} />
      <SkeletonPanel lines={6} />
      <SkeletonPanel lines={4} />
    </>
  );
}

export function ProjectsReportView() {
  const { period, setPeriod, todayKey } = useReportPeriod();

  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } =
    useQuery<ProjectsReportResponse>({
      queryKey: ["reports", "projects", period.kind, period.key],
      placeholderData: (previous) => previous,
      queryFn: () =>
        fetchJson<ProjectsReportResponse>(
          `/api/reports/projects?${periodSearchParams(period)}`,
          "Projekt-Report konnte nicht geladen werden",
        ),
    });

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(projectTreeToCsv(data.tree), periodFileName(period));
    toast.success("CSV exportiert");
  };

  const hasData = Boolean(data && data.tree.totalMinutes > 0);

  return (
    <>
      <ReportHeader
        report="projects"
        period={
          <ReportPeriodNav
            period={period}
            todayKey={todayKey}
            onChange={setPeriod}
          />
        }
        actions={
          <>
            <PeriodKindChips
              value={period.kind}
              onChange={(kind) =>
                setPeriod(convertPeriod(period, kind, todayKey))
              }
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 md:h-8"
              onClick={exportCsv}
              disabled={!hasData || isPlaceholderData}
            >
              <Download />
              CSV
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <RefetchBar active={isFetching && isPlaceholderData} />
        {error && (!data || data.period.key !== period.key) ? (
          <ErrorState
            title="Projekt-Report konnte nicht geladen werden"
            error={error}
            onRetry={() => refetch()}
          />
        ) : !data || isLoading ? (
          <ProjectsSkeleton />
        ) : (
          <ReportBody data={data} />
        )}
      </div>
    </>
  );
}

function ReportBody({ data }: { data: ProjectsReportResponse }) {
  const { summary, tree, trend } = data;
  const focus = findFocusLevel(tree);
  const biggest = focus.nodes[0];
  const levelLabel =
    trend.levelPath.length > 0
      ? `Unterprojekte von ${trend.levelPath.join(PROJECT_PATH_SEPARATOR)}`
      : "Oberste Projektebene";
  const trendHasData = trend.rows.some((row) => row.total > 0);
  const lastMonth = trend.months[trend.months.length - 1];
  const windowLabel = `${formatMonth(trend.months[0])} – ${formatMonth(lastMonth)}`;

  return (
    <>
      {summary.totalMinutes > 0 ? (
        <StatStrip>
          <Stat
            label="Gesamt"
            value={formatDuration(summary.totalMinutes)}
            hint={`${summary.entries} Einträge · ${data.period.label}`}
          />
          <Stat
            label="Größtes Projekt"
            value={biggest ? formatShare(biggest.share) : "—"}
            hint={
              biggest ? (
                <span className="block truncate" title={biggest.id}>
                  {biggest.name} · {formatDuration(biggest.totalMinutes)}
                </span>
              ) : (
                "Keine Projekte"
              )
            }
          />
          <Stat
            label="Ohne Projekt"
            value={formatDuration(summary.unassignedMinutes)}
            tone={summary.unassignedMinutes > 0 ? "warning" : "neutral"}
            hint={
              summary.bulkFillMinutes > 0
                ? `davon ${formatDuration(summary.bulkFillMinutes)} aufgefüllt`
                : formatShare(
                    summary.totalMinutes > 0
                      ? summary.unassignedMinutes / summary.totalMinutes
                      : 0,
                  )
            }
          />
        </StatStrip>
      ) : null}

      <Panel key={data.period.key}>
        <PanelHeader
          title="Projektbaum"
          meta={`${data.period.label} · Anteil am Gesamtvolumen`}
        />
        {tree.totalMinutes > 0 ? (
          <ProjectTree tree={tree} />
        ) : (
          <EmptyState
            title={`Keine Arbeitszeit ${periodPhrase(data.period)}`}
            description="Für diesen Zeitraum gibt es keine Arbeitseinträge. Wähle einen anderen Zeitraum oder synchronisiere Timing."
          />
        )}
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          Gezählt wird nur Arbeitszeit. Urlaub, Krankheit, Feiertage und der
          Überstunden-Saldo fehlen bewusst; aufgefüllte Tage haben kein Projekt
          und stehen unter „Ohne Projekt“.
        </p>
      </Panel>

      <Panel>
        <PanelHeader
          title="Verlauf"
          meta={`${windowLabel}${trendHasData ? ` · ${levelLabel}` : ""}`}
        />
        <PanelBody>
          {trendHasData ? (
            <ProjectTrendChart trend={trend} />
          ) : (
            <EmptyState
              className="px-0 py-6"
              title="Kein Verlauf"
              description={`In den zwölf Monaten bis ${formatMonth(lastMonth)} gibt es keine Arbeitseinträge.`}
            />
          )}
        </PanelBody>
      </Panel>
    </>
  );
}
