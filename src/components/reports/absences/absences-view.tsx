"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import {
  RefetchBar,
  SkeletonPanel,
  SkeletonStatStrip,
} from "@/components/app/skeletons";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import { AbsenceRangeDialog } from "@/components/entries/absence-range-dialog";
import { fetchJson } from "@/components/reports/fetch-json";
import { ReportHeader } from "@/components/reports/report-header";
import { ReportYearNav } from "@/components/reports/report-period-nav";
import { useReportYear } from "@/components/reports/use-report-params";
import { Button } from "@/components/ui/button";
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
  const [absenceKey, setAbsenceKey] = useState<number | null>(null);

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
        actions={
          <Button
            type="button"
            size="sm"
            className="h-11 md:h-8"
            onClick={() => setAbsenceKey(Date.now())}
          >
            <CalendarPlus />
            Abwesenheit eintragen
          </Button>
        }
      />

      {absenceKey !== null ? (
        <AbsenceRangeDialog
          key={absenceKey}
          open
          onOpenChange={(open) => {
            if (!open) setAbsenceKey(null);
          }}
        />
      ) : null}

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
  const showSpecial =
    totals.days.specialLeave + totals.days.educationalLeave > 0;
  const showOvertimeReduction = totals.days.overtimeReduction > 0;
  const others = account.others;
  const otherHint = (line: { taken: number; planned: number }) =>
    line.planned > 0
      ? `davon ${formatDays(line.planned)} geplant · ohne Anspruch`
      : "verringert den Anspruch nicht";
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
        {showSpecial || showOvertimeReduction || showUnpaid ? (
          <StatStrip>
            {others.specialLeave.taken + others.specialLeave.planned > 0 ? (
              <Stat
                label="Sonderurlaub"
                value={formatDays(
                  others.specialLeave.taken + others.specialLeave.planned,
                )}
                hint={otherHint(others.specialLeave)}
              />
            ) : null}
            {others.educationalLeave.taken + others.educationalLeave.planned >
            0 ? (
              <Stat
                label="Bildungsurlaub"
                value={formatDays(
                  others.educationalLeave.taken +
                    others.educationalLeave.planned,
                )}
                hint={otherHint(others.educationalLeave)}
              />
            ) : null}
            {showOvertimeReduction ? (
              <Stat
                label="Überstundenabbau"
                value={formatDays(
                  others.overtimeReduction.taken +
                    others.overtimeReduction.planned,
                )}
                hint={
                  others.overtimeReduction.planned > 0
                    ? `davon ${formatDays(others.overtimeReduction.planned)} geplant · aus dem Saldo`
                    : "aus dem Saldo, nicht vom Urlaub"
                }
              />
            ) : null}
            {showUnpaid ? (
              <Stat
                label="Unbezahlt"
                value={formatDays(others.unpaid.taken + others.unpaid.planned)}
                hint={
                  others.unpaid.planned > 0
                    ? `davon ${formatDays(others.unpaid.planned)} geplant · ohne Soll`
                    : "ohne Soll, verringert den Anspruch nicht"
                }
              />
            ) : null}
          </StatStrip>
        ) : null}
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
              <AbsencesChart
                months={report.months}
                showUnpaid={showUnpaid}
                showSpecial={showSpecial}
                showOvertimeReduction={showOvertimeReduction}
              />
            </PanelBody>
            <div className="border-t">
              <AbsencesTable
                months={report.months}
                totals={totals.days}
                showUnpaid={showUnpaid}
                showSpecial={showSpecial}
                showOvertimeReduction={showOvertimeReduction}
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
        (Niedersachsen, aus dem Feiertags-Dienst und dem Import) verbrauchen
        keinen Urlaub, Krankheit geht vor Urlaub. Den Anspruch verringern nur
        Urlaub und Resturlaub (auch Urlaubseinträge ohne verknüpfte Abwesenheit,
        etwa aus Timing); Sonder- und Bildungsurlaub, Überstundenabbau und
        unbezahlte Abwesenheit stehen getrennt. Unbezahlt zählt Einträge dieser
        Art (unbezahlter Urlaub, Elternzeit, Mutterschutz, Sabbatical) und Tage,
        die unter Probleme mit dem Grund „Unbezahlter Urlaub“ als geprüft
        markiert sind und keine Arbeitseinträge haben.
      </p>
      {report.holidayServiceUnavailable ? (
        <p className="text-warning">
          Der Feiertags-Dienst war nicht erreichbar; es sind nur importierte
          Feiertage berücksichtigt.
        </p>
      ) : null}
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
