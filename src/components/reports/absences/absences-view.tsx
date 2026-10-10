"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import {
  RefetchBar,
  SkeletonPanel,
  SkeletonStatStrip,
} from "@/components/app/skeletons";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import { fetchJson } from "@/components/reports/fetch-json";
import { ReportHeader } from "@/components/reports/report-header";
import { ReportYearNav } from "@/components/reports/report-period-nav";
import { useReportYear } from "@/components/reports/use-report-params";
import type { AbsenceReport } from "@/lib/reports/absences";
import { cn } from "@/lib/utils";
import {
  formatDays,
  formatHoursLabel,
  formatWorkDays,
  SETTINGS_VACATION_HREF,
} from "./absence-style";
import { AbsencesCalendar } from "./absences-calendar";
import { AbsencesChart } from "./absences-chart";
import { AbsencesTable } from "./absences-table";

export function AbsencesView() {
  // Planung reicht höchstens ins nächste Jahr
  const { year, setYear, currentYear, maxYear } = useReportYear({
    maxOffset: 1,
  });

  const query = useQuery({
    queryKey: ["reports", "absences", year],
    queryFn: () =>
      fetchJson<AbsenceReport>(
        `/api/reports/absences?year=${year}`,
        "Abwesenheiten konnten nicht geladen werden",
      ),
    placeholderData: keepPreviousData,
  });

  const report = query.data;
  const isStale = Boolean(report && report.year !== year);

  return (
    <>
      <ReportHeader
        report="absences"
        period={
          <ReportYearNav
            year={year}
            currentYear={currentYear}
            maxYear={maxYear}
            onChange={setYear}
          />
        }
      />

      {query.isPending ? (
        <div className="space-y-6" aria-busy="true">
          <SkeletonStatStrip tiles={4} />
          <SkeletonStatStrip tiles={3} />
          <SkeletonPanel lines={6} />
          <SkeletonPanel lines={8} />
        </div>
      ) : query.isError && !report ? (
        <ErrorState
          title="Abwesenheiten konnten nicht geladen werden"
          error={query.error}
          onRetry={() => query.refetch()}
        />
      ) : report ? (
        <div className="space-y-6">
          <RefetchBar active={query.isFetching && isStale} />
          {query.isError ? (
            <ErrorState
              title={`Daten für ${year} konnten nicht geladen werden`}
              error={query.error}
              onRetry={() => query.refetch()}
            />
          ) : null}
          {/* Beim Jahreswechsel bleiben die alten Zahlen gedimmt stehen, bis die neuen da sind */}
          <div
            className={cn(
              "space-y-6 transition-opacity duration-[120ms]",
              isStale && "opacity-60",
            )}
            aria-busy={isStale}
          >
            <AbsencesContent report={report} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function AbsencesContent({ report }: { report: AbsenceReport }) {
  const { account, totals } = report;
  const isPastYear = report.year < Number(report.todayKey.slice(0, 4));
  const showUnpaid = totals.days.unpaid > 0;
  const hasAbsences = report.days.length > 0;

  return (
    <>
      <section aria-label="Urlaubskonto" className="space-y-2">
        <StatStrip>
          <Stat
            label="Resturlaub"
            value={formatDays(account.remaining)}
            tone={account.remaining < 0 ? "negative" : "neutral"}
            emphasis
            hint={
              account.remaining < 0
                ? "Mehr Urlaub eingetragen als Anspruch"
                : account.planned > 0
                  ? "nach geplantem Urlaub"
                  : `für ${report.year}`
            }
          />
          <Stat
            label="Anspruch"
            value={formatDays(account.entitlement)}
            hint="In den Einstellungen ändern"
            href={SETTINGS_VACATION_HREF}
          />
          <Stat
            label="Genommen"
            value={formatDays(account.taken)}
            hint={isPastYear ? `im Jahr ${report.year}` : "bis heute"}
          />
          <Stat
            label="Geplant"
            value={formatDays(account.planned)}
            hint={isPastYear ? "Jahr ist vorbei" : "Urlaub nach heute"}
          />
        </StatStrip>
      </section>

      <section aria-label="Weitere Abwesenheiten">
        <StatStrip>
          <Stat
            label="Krankheit"
            value={formatDays(totals.days.sick)}
            hint={
              totals.hours.sick > 0
                ? `${formatHoursLabel(totals.hours.sick)} erfasst`
                : undefined
            }
          />
          <Stat
            label="Feiertage"
            value={formatDays(totals.days.holiday)}
            hint="an Arbeitstagen"
          />
          {showUnpaid ? (
            <Stat
              label="Unbezahlter Urlaub"
              value={formatDays(totals.days.unpaid)}
              hint="aus geprüften Tagen"
            />
          ) : null}
        </StatStrip>
      </section>

      {hasAbsences ? (
        <>
          <Panel>
            <PanelHeader title="Kalender" meta={String(report.year)} />
            <PanelBody>
              <AbsencesCalendar
                year={report.year}
                todayKey={report.todayKey}
                days={report.days}
                workDays={report.workDays}
              />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Je Monat" meta="in Tagen" />
            <PanelBody>
              <AbsencesChart months={report.months} showUnpaid={showUnpaid} />
            </PanelBody>
            <div className="border-t">
              <AbsencesTable
                months={report.months}
                totals={totals.days}
                showUnpaid={showUnpaid}
              />
            </div>
          </Panel>
        </>
      ) : (
        <Panel>
          <EmptyState
            title={`Keine Abwesenheiten in ${report.year}`}
            description="Urlaub, Krankheit und Feiertage erscheinen hier, sobald Einträge dieser Art vorhanden sind – etwa aus dem Timing-Sync oder dem Feiertagsimport in den Einstellungen."
          />
        </Panel>
      )}

      <CountingRules report={report} />
    </>
  );
}

function CountingRules({ report }: { report: AbsenceReport }) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        Gezählt wird an Arbeitstagen ({formatWorkDays(report.workDays)}),
        umgerechnet über das Tagessoll von{" "}
        {formatHoursLabel(report.dailyTargetHours)} und auf halbe Tage gerundet;
        jede erfasste Abwesenheit zählt mindestens einen halben Tag. Feiertage
        verbrauchen keinen Urlaub, Krankheit geht vor Urlaub. Unbezahlter Urlaub
        kommt aus Tagen, die unter Probleme mit diesem Grund als geprüft
        markiert sind und keine Arbeitseinträge haben; er verringert den
        Anspruch nicht.
      </p>
      {report.nonWorkDayAbsences > 0 ? (
        <p>
          {report.nonWorkDayAbsences === 1
            ? "1 Abwesenheit liegt auf einem Nicht-Arbeitstag und zählt nicht mit."
            : `${report.nonWorkDayAbsences} Abwesenheiten liegen auf Nicht-Arbeitstagen und zählen nicht mit.`}
        </p>
      ) : null}
      <p>
        Anspruch und Tagessoll gelten mit den aktuellen Werten für jedes Jahr;
        Resturlaub aus dem Vorjahr wird nicht übertragen.{" "}
        <Link
          href={SETTINGS_VACATION_HREF}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Urlaubsanspruch einstellen
        </Link>
      </p>
    </div>
  );
}
