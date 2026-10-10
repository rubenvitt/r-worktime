"use client";

import { ChevronRight, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Delta, Duration } from "@/components/app/duration";
import { EmptyState } from "@/components/app/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import { StatusBadge } from "@/components/app/status-badge";
import {
  formatDateLong,
  formatHours,
  formatHoursDelta,
  formatPercent,
  hoursToMinutes,
} from "@/lib/format";
import { billableShare } from "@/lib/reports/billing-status";
import type { RangeSummary, YearMonth, YearQuarter } from "@/lib/reports/year";
import { cn } from "@/lib/utils";
import type { YearReportResponse } from "./api-types";
import { BalanceChart, type BalancePoint } from "./balance-chart";
import {
  formatDayMonth,
  monthLabel,
  monthShort,
  PERIOD_STATUS_LABEL,
  quarterMonths,
} from "./year-format";

const ROW_GRID =
  "md:grid md:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))] md:items-center md:gap-3";

function tone(hours: number | null) {
  if (hours === null) return "neutral" as const;
  const minutes = hoursToMinutes(hours);
  return minutes > 0 ? "positive" : minutes < 0 ? "negative" : "neutral";
}

function BillableCell({ summary }: { summary: RangeSummary }) {
  const share = billableShare(summary.billableHours, summary.workHours);
  return (
    <span className="num">
      {formatHours(summary.billableHours)}
      {share !== null ? (
        <span className="ml-1 text-xs text-muted-foreground">
          {formatPercent(share)}
        </span>
      ) : null}
    </span>
  );
}

function hasValues(status: YearMonth["status"]) {
  return status === "closed" || status === "current";
}

/** Werte einer Zeile: Desktop als Spalten, mobil zweizeilig. */
function RowValues({
  summary,
  delta,
  balance,
  counted,
}: {
  summary: RangeSummary;
  delta: number;
  balance: number | null;
  counted: boolean;
}) {
  if (!counted) {
    return <span className="hidden md:col-span-5 md:block" />;
  }
  return (
    <>
      <span className="hidden text-right md:block">
        <Duration minutes={hoursToMinutes(summary.actualHours)} />
      </span>
      <span className="hidden text-right text-muted-foreground md:block">
        <Duration minutes={hoursToMinutes(summary.targetHours)} />
      </span>
      <span className="hidden text-right md:block">
        <Delta minutes={hoursToMinutes(delta)} />
      </span>
      <span className="hidden text-right md:block">
        <BillableCell summary={summary} />
      </span>
      <span className="hidden text-right md:block">
        {balance !== null ? (
          <Delta minutes={hoursToMinutes(balance)} />
        ) : (
          <Delta minutes={null} />
        )}
      </span>
    </>
  );
}

function MobileValues({
  summary,
  balance,
}: {
  summary: RangeSummary;
  balance: number | null;
}) {
  return (
    <span className="num col-span-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground md:hidden">
      <span>
        <Duration
          minutes={hoursToMinutes(summary.actualHours)}
          className="text-foreground"
        />{" "}
        von <Duration minutes={hoursToMinutes(summary.targetHours)} />
      </span>
      <span>
        abrechenbar <BillableCell summary={summary} />
      </span>
      {balance !== null ? <span>Saldo {formatHoursDelta(balance)}</span> : null}
    </span>
  );
}

function MonthRow({ month }: { month: YearMonth }) {
  const counted = hasValues(month.status);
  const partial =
    month.from !== null &&
    (month.from !== `${month.month}-01` || month.status === "current");
  return (
    <li
      className={cn(
        "grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2 pr-4 pl-10 text-sm",
        ROW_GRID,
      )}
    >
      <span className="min-w-0">
        <span className="font-medium">{monthLabel(month.month)}</span>
        {partial && month.from && month.to ? (
          <span className="ml-2 text-xs text-muted-foreground">
            {formatDayMonth(month.from)}–{formatDayMonth(month.to)}
          </span>
        ) : null}
        {!counted ? (
          <span className="ml-2 text-xs text-muted-foreground">
            {PERIOD_STATUS_LABEL[month.status]}
          </span>
        ) : null}
      </span>
      <span className="text-right md:hidden">
        {counted ? (
          <Delta minutes={hoursToMinutes(month.deltaHours)} />
        ) : (
          <Delta minutes={null} />
        )}
      </span>
      {counted ? (
        <MobileValues summary={month} balance={month.balanceHours} />
      ) : null}
      <RowValues
        summary={month}
        delta={month.deltaHours}
        balance={month.balanceHours}
        counted={counted}
      />
    </li>
  );
}

function QuarterRow({
  quarter,
  months,
}: {
  quarter: YearQuarter;
  months: YearMonth[];
}) {
  const counted = quarter.status === "closed" || quarter.status === "current";
  return (
    <li>
      <details className="group" open={quarter.status === "current"}>
        <summary
          className={cn(
            "grid min-h-11 cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-2 text-sm transition-colors duration-[120ms] hover:bg-accent [&::-webkit-details-marker]:hidden",
            ROW_GRID,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-[160ms] group-open:rotate-90"
            />
            <span className="font-semibold">Q{quarter.quarter}</span>
            <span className="text-xs text-muted-foreground">
              {quarterMonths(quarter.quarter)}
            </span>
            {quarter.status !== "closed" ? (
              <StatusBadge
                tone={quarter.status === "current" ? "info" : "neutral"}
              >
                {PERIOD_STATUS_LABEL[quarter.status]}
              </StatusBadge>
            ) : null}
          </span>
          <span className="text-right md:hidden">
            {counted ? (
              <Delta minutes={hoursToMinutes(quarter.deltaHours)} />
            ) : (
              <Delta minutes={null} />
            )}
          </span>
          {counted ? (
            <MobileValues summary={quarter} balance={quarter.balanceHours} />
          ) : null}
          <RowValues
            summary={quarter}
            delta={quarter.deltaHours}
            balance={quarter.balanceHours}
            counted={counted}
          />
        </summary>
        <ul className="divide-y border-t bg-muted/30">
          {months.map((month) => (
            <MonthRow key={month.month} month={month} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function Notice({
  tone: noticeTone,
  children,
}: {
  tone: "info" | "warning";
  children: React.ReactNode;
}) {
  const Icon = noticeTone === "warning" ? TriangleAlert : Info;
  return (
    <p className="flex gap-2 text-[13px] text-muted-foreground">
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0",
          noticeTone === "warning" ? "text-warning" : "text-muted-foreground",
        )}
      />
      <span>{children}</span>
    </p>
  );
}

export function YearSection({ data }: { data: YearReportResponse }) {
  const { report, holidays, currentBalance, adjustment } = data;
  const counted = report.months.filter((m) => hasValues(m.status));
  const isCurrentYear = report.year === Number(report.todayKey.slice(0, 4));

  if (report.trackingStart === null) {
    return (
      <Panel>
        <EmptyState
          title="Noch keine Einträge"
          description="Sobald Zeiten erfasst oder aus Timing übernommen sind, erscheint hier die Jahresübersicht."
          action={
            <Link href="/upload" className="text-sm underline">
              Zeiten importieren
            </Link>
          }
        />
      </Panel>
    );
  }

  if (counted.length === 0) {
    const before = report.trackingStart > `${report.year}-12-31`;
    return (
      <Panel>
        <EmptyState
          title={`Keine erfassten Monate in ${report.year}`}
          description={
            before
              ? `Die Erfassung beginnt am ${formatDateLong(report.trackingStart)}.`
              : "Dieses Jahr liegt noch in der Zukunft."
          }
        />
      </Panel>
    );
  }

  const totals = report.totals;
  const share = billableShare(totals.billableHours, totals.workHours);
  const lastCounted = counted[counted.length - 1];
  const balanceMismatch =
    isCurrentYear &&
    currentBalance !== null &&
    report.closingBalance !== null &&
    hoursToMinutes(currentBalance) !== hoursToMinutes(report.closingBalance);
  const trackingInYear = report.trackingStart.startsWith(`${report.year}-`);

  const points: BalancePoint[] = report.months.map((month) => ({
    key: month.month,
    label: monthShort(month.month),
    title:
      month.status === "current"
        ? `${monthLabel(month.month)} (bis heute)`
        : monthLabel(month.month),
    balance:
      month.balanceHours === null ? null : hoursToMinutes(month.balanceHours),
    delta: hasValues(month.status)
      ? hoursToMinutes(month.deltaHours)
      : undefined,
    actual: hasValues(month.status)
      ? hoursToMinutes(month.actualHours)
      : undefined,
    target: hasValues(month.status)
      ? hoursToMinutes(month.targetHours)
      : undefined,
  }));

  return (
    <div className="space-y-4">
      <StatStrip>
        <Stat
          label={isCurrentYear ? "Saldo heute" : `Saldo Ende ${report.year}`}
          emphasis
          tone={tone(report.closingBalance)}
          value={
            report.closingBalance !== null
              ? formatHoursDelta(report.closingBalance)
              : "—"
          }
          hint={
            report.openingBalance !== null
              ? `${trackingInYear ? "Start" : "Jahresbeginn"} ${formatHoursDelta(report.openingBalance)}`
              : undefined
          }
        />
        <Stat
          label="Differenz im Jahr"
          tone={tone(totals.deltaHours)}
          value={formatHoursDelta(totals.deltaHours)}
          hint={
            lastCounted.to
              ? `${formatDayMonth(counted[0].from ?? `${report.year}-01-01`)}–${formatDayMonth(lastCounted.to)}`
              : undefined
          }
        />
        <Stat
          label="Gearbeitet"
          value={formatHours(totals.actualHours)}
          hint={`von ${formatHours(totals.targetHours)} Soll`}
        />
        <Stat
          label="Abrechenbar"
          value={formatHours(totals.billableHours)}
          hint={
            share !== null
              ? `${formatPercent(share)} der Arbeit`
              : "keine Arbeit erfasst"
          }
        />
      </StatStrip>

      <Panel>
        <PanelHeader
          title="Quartale"
          meta="Saldo jeweils am Ende des gezählten Zeitraums"
        />
        <div
          className={cn(
            "hidden border-b px-4 py-2 text-xs text-muted-foreground",
            ROW_GRID,
          )}
          aria-hidden="true"
        >
          <span>Zeitraum</span>
          <span className="text-right">Gearbeitet</span>
          <span className="text-right">Soll</span>
          <span className="text-right">Differenz</span>
          <span className="text-right">Abrechenbar</span>
          <span className="text-right">Saldo</span>
        </div>
        <ul className="divide-y">
          {report.quarters.map((quarter) => (
            <QuarterRow
              key={quarter.quarter}
              quarter={quarter}
              months={report.months.slice(
                (quarter.quarter - 1) * 3,
                quarter.quarter * 3,
              )}
            />
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader
          title="Saldo-Verlauf"
          meta={`Monatsende, ${report.year}`}
        />
        <PanelBody>
          <BalanceChart
            points={points}
            ariaLabel={`Kumulierter Saldo je Monat ${report.year}`}
          />
        </PanelBody>
      </Panel>

      <div className="space-y-2">
        <Notice tone="info">
          Gearbeitet zählt Arbeit inklusive Auffüllungen; Urlaub und Krankheit
          zählen mit ihren Stunden, je Tag höchstens mit dem Tagessoll.
          Feiertage (offiziell und importiert) mindern das Soll.
          {adjustment
            ? ` Gezählt wird ab dem Tag nach dem Anfangssaldo (${formatDateLong(adjustment.date)}).`
            : ` Gezählt wird ab dem ersten Eintrag (${formatDateLong(report.trackingStart)}).`}{" "}
          Abrechenbar nutzt den Timing-Abrechnungsstatus; die Quote ist
          abrechenbar von gesamt wie im Abrechnungsbericht, Einträge ohne Status
          zählen mit. Arbeitsstunden sind je Eintrag auf Viertelstunden gerundet
          wie im Saldo, Urlaub und Krankheit zählen ungerundet; der
          Abrechnungsbericht rechnet minutengenau.
        </Notice>
        {holidays.unavailable ? (
          <Notice tone="warning">
            Der Feiertags-Dienst war nicht erreichbar; nur importierte Feiertage
            mindern das Soll.
          </Notice>
        ) : null}
        {balanceMismatch && currentBalance !== null ? (
          <Notice tone="warning">
            Der Saldo auf der Überstunden-Seite beträgt{" "}
            {formatHoursDelta(currentBalance)}. Beide rechnen nach denselben
            Regeln; eine Abweichung entsteht meist, weil der Saldo bis zu fünf
            Minuten zwischengespeichert wird.
          </Notice>
        ) : null}
      </div>
    </div>
  );
}
