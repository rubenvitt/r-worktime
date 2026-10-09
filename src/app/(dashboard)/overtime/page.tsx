"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { currentMonth } from "@/components/app/month";
import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { PeriodNav } from "@/components/app/period-nav";
import { SkeletonRows } from "@/components/app/skeletons";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import { useTrackingStart } from "@/components/app/use-tracking-start";
import {
  type DeltaPoint,
  MonthlyDeltaChart,
} from "@/components/overview/monthly-delta-chart";
import { OvertimeMonths } from "@/components/overview/overtime-months";
import { chartMonths, MONTH_SHORT } from "@/components/overview/overtime-utils";
import { deltaTone, saldoContext } from "@/components/overview/saldo-context";
import {
  useMonthlyHistory,
  useMonthlyOvertime,
  useTotalOvertime,
  useYearlyOvertime,
} from "@/components/overview/use-overtime";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatDelta,
  formatHours,
  formatHoursDelta,
  formatMonth,
  hoursToMinutes,
} from "@/lib/format";

function Failed({ error }: { error: unknown }) {
  return (
    <span
      className="text-muted-foreground"
      title={error instanceof Error ? error.message : undefined}
    >
      —
    </span>
  );
}

function Loading({ wide }: { wide?: boolean }) {
  return <Skeleton className={wide ? "my-1 h-7 w-28" : "my-1 h-5 w-24"} />;
}

export default function OvertimePage() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIndex = today.getMonth();
  const [year, setYear] = useState(currentYear);

  const total = useTotalOvertime();
  const yearly = useYearlyOvertime(year);
  // „Monat bis heute“ immer für den laufenden Monat (gleiche Abfrage wie die Übersicht)
  const monthly = useMonthlyOvertime(currentYear, currentMonthIndex);
  const history = useMonthlyHistory(year);
  const tracking = useTrackingStart();

  const monthName = formatMonth(currentMonth()).split(" ")[0];
  const saldoMinutes = total.data ? hoursToMinutes(total.data.balance) : null;
  const monthMinutes = monthly.data
    ? hoursToMinutes(monthly.data.balance)
    : null;

  const months = history.data ?? [];
  const isCurrentYear = year === currentYear;
  const points: DeltaPoint[] = chartMonths(
    months,
    year,
    tracking.trackingStart,
  ).map((m) => {
    const running = isCurrentYear && m.monthIndex === currentMonthIndex;
    // Laufender Monat: Bis-heute-Wert statt Soll für den ganzen Monat
    const source = running && monthly.data?.details ? monthly.data.details : m;
    const actual = hoursToMinutes(source.actualHours);
    const target = hoursToMinutes(source.targetHours);
    return {
      key: `${year}-${m.monthIndex}`,
      label: running
        ? `${MONTH_SHORT[m.monthIndex]} (bis heute)`
        : MONTH_SHORT[m.monthIndex],
      delta: actual - target,
      actual,
      target,
    };
  });

  const saldoHint = tracking.isLoading ? undefined : (
    <>
      <span className="block">
        {saldoContext(tracking.adjustmentDate)}
        {tracking.adjustmentMinutes !== null
          ? ` ${formatDelta(tracking.adjustmentMinutes)}`
          : null}
      </span>
      {total.data?.details ? (
        <span className="num block">
          {formatHours(total.data.details.actualHours)} von{" "}
          {formatHours(total.data.details.targetHours)}
        </span>
      ) : null}
    </>
  );

  return (
    <PageContainer>
      <PageHeader
        title="Überstunden"
        period={
          <PeriodNav
            label={String(year)}
            prevLabel="Vorheriges Jahr"
            nextLabel="Nächstes Jahr"
            onPrev={() => setYear((y) => y - 1)}
            onNext={() => setYear((y) => Math.min(currentYear, y + 1))}
            onToday={() => setYear(currentYear)}
            todayLabel="Aktuelles Jahr"
            isCurrent={isCurrentYear}
            nextDisabled={year >= currentYear}
          />
        }
        actions={
          <Button asChild variant="ghost" size="sm" className="h-11 md:h-8">
            <Link href="/settings/overtime">Arbeitszeit einstellen</Link>
          </Button>
        }
      />

      <div className="space-y-6">
        <StatStrip>
          <Stat
            label="Saldo"
            emphasis
            tone={saldoMinutes !== null ? deltaTone(saldoMinutes) : "neutral"}
            value={
              total.isLoading ? (
                <Loading wide />
              ) : total.isError || !total.data ? (
                <Failed error={total.error} />
              ) : (
                formatHoursDelta(total.data.balance)
              )
            }
            hint={saldoHint}
          />
          <Stat
            label={monthName}
            tone={monthMinutes !== null ? deltaTone(monthMinutes) : "neutral"}
            value={
              monthly.isLoading ? (
                <Loading />
              ) : monthly.isError || !monthly.data ? (
                <Failed error={monthly.error} />
              ) : (
                formatHoursDelta(monthly.data.balance)
              )
            }
            hint="bis heute"
          />
          <Stat
            label={`Jahr ${year}`}
            value={
              yearly.isLoading ? (
                <Loading />
              ) : yearly.isError || !yearly.data ? (
                <Failed error={yearly.error} />
              ) : (
                formatHoursDelta(yearly.data.balance)
              )
            }
            hint="Soll ab 01.01., ohne Anfangs-Saldo"
          />
        </StatStrip>

        {history.isError ? (
          <ErrorState
            title="Monatswerte konnten nicht geladen werden"
            error={history.error}
            onRetry={() => history.refetch()}
          />
        ) : history.isLoading ? (
          <>
            <Skeleton className="h-[200px] w-full rounded-lg" />
            <Panel>
              <SkeletonRows count={6} height={44} />
            </Panel>
          </>
        ) : months.length === 0 ? (
          <Panel>
            <EmptyState title={`Für ${year} gibt es noch keine Zeiten.`} />
          </Panel>
        ) : (
          <>
            {points.length > 0 ? (
              <Panel>
                <PanelHeader title="Differenz je Monat" />
                <PanelBody className="pt-2">
                  <MonthlyDeltaChart points={points} />
                </PanelBody>
              </Panel>
            ) : null}
            <Panel>
              <PanelHeader title={`Monate ${year}`} />
              <PanelBody flush>
                <OvertimeMonths
                  months={months}
                  year={year}
                  trackingStart={tracking.trackingStart}
                  currentYear={currentYear}
                  currentMonthIndex={currentMonthIndex}
                />
              </PanelBody>
            </Panel>
          </>
        )}
      </div>
    </PageContainer>
  );
}
