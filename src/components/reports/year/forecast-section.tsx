"use client";

import { Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Delta, Duration } from "@/components/app/duration";
import { FilterChips } from "@/components/app/filter-chips";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import {
  formatDecimal,
  formatDuration,
  formatHours,
  formatHoursDelta,
  formatPercent,
  hoursToMinutes,
} from "@/lib/format";
import {
  BASE_MONTH_OPTIONS,
  type BaseMonthCount,
  FORECAST_HORIZONS,
  type ForecastHorizon,
  type ForecastMonth,
  forecastEndMonth,
} from "@/lib/reports/forecast";
import { cn } from "@/lib/utils";
import type { ForecastResponse } from "./api-types";
import { BalanceChart, type BalancePoint } from "./balance-chart";
import {
  formatDayCount,
  formatDayMonth,
  monthLabel,
  monthShortWithYear,
} from "./year-format";

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** [1,2,3,4,5] → "Mo–Fr", [1,3,5] → "Mo, Mi, Fr" */
function formatWorkDays(workDays: number[]): string {
  const sorted = [...workDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (sorted.length === 0) return "keine";
  const mondayBased = sorted.map((d) => (d + 6) % 7);
  const contiguous = mondayBased.every(
    (d, i) => i === 0 || d === mondayBased[i - 1] + 1,
  );
  if (contiguous && sorted.length > 2) {
    return `${WEEKDAY_SHORT[sorted[0]]}–${WEEKDAY_SHORT[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

const ROW_GRID =
  "md:grid md:grid-cols-[minmax(0,1.3fr)_repeat(7,minmax(0,1fr))] md:items-center md:gap-3";

function tone(hours: number) {
  const minutes = hoursToMinutes(hours);
  return minutes > 0 ? "positive" : minutes < 0 ? "negative" : "neutral";
}

function Notice({
  warning,
  children,
}: {
  warning?: boolean;
  children: React.ReactNode;
}) {
  const Icon = warning ? TriangleAlert : Info;
  return (
    <li className="flex gap-2">
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0",
          warning ? "text-warning" : "text-muted-foreground",
        )}
      />
      <span>{children}</span>
    </li>
  );
}

function MonthRow({
  month,
  names,
}: {
  month: ForecastMonth;
  names: Record<string, string>;
}) {
  const holidayTitle = month.holidays
    .map((key) => `${formatDayMonth(key)} ${names[key] ?? "Feiertag"}`)
    .join(", ");
  const isCurrent = month.kind === "current";
  return (
    <li
      className={cn(
        "grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm md:items-center",
        ROW_GRID,
      )}
    >
      <span className="min-w-0">
        <span className="font-medium">{monthLabel(month.month)}</span>
        {isCurrent ? (
          <span className="ml-2 text-xs text-muted-foreground">
            {month.from ? `ab ${formatDayMonth(month.from)}` : "keine Resttage"}
          </span>
        ) : null}
        {isCurrent && month.toDate ? (
          <span className="num block text-xs text-muted-foreground">
            bisher {formatHours(month.toDate.actualHours)} von{" "}
            {formatHours(month.toDate.targetHours)} (
            {formatHoursDelta(month.toDate.deltaHours)})
          </span>
        ) : null}
        {isCurrent && month.todayRemainingHours > 0 ? (
          <span className="num block text-xs text-muted-foreground">
            Erwartet enthält {formatHours(month.todayRemainingHours)} Rest von
            heute
          </span>
        ) : null}
      </span>
      <span className="text-right md:hidden">
        <Delta minutes={hoursToMinutes(month.deltaHours)} />
      </span>

      {/* mobil */}
      <span className="num col-span-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground md:hidden">
        <span>
          {formatDecimal(month.availableDays)} von {month.workDays} Tagen
        </span>
        {month.holidayDays > 0 ? (
          <span title={holidayTitle}>Feiertage: {month.holidayDays}</span>
        ) : null}
        {month.absenceDays > 0 ? (
          <span>Urlaub/Krank: {formatDecimal(month.absenceDays)}</span>
        ) : null}
        {month.unpaidDays > 0 ? (
          <span>Unbezahlt: {formatDecimal(month.unpaidDays)}</span>
        ) : null}
        {month.overtimeReductionDays > 0 ? (
          <span>
            Überstundenabbau: {formatDecimal(month.overtimeReductionDays)}
          </span>
        ) : null}
        <span>
          <Duration
            minutes={hoursToMinutes(month.expectedHours)}
            className="text-foreground"
          />{" "}
          von <Duration minutes={hoursToMinutes(month.targetHours)} />
        </span>
        {month.expectedBillableHours !== null ? (
          <span>abrechenbar {formatHours(month.expectedBillableHours)}</span>
        ) : null}
        <span>Saldo {formatHoursDelta(month.balanceHours)}</span>
      </span>

      {/* Desktop */}
      <span className="num hidden text-right md:block">
        {formatDecimal(month.availableDays)}
        <span className="text-muted-foreground"> / {month.workDays}</span>
      </span>
      <span
        className="num hidden text-right text-muted-foreground md:block"
        title={holidayTitle || undefined}
      >
        {month.holidayDays || "–"}
        {month.absenceDays ? ` · ${formatDecimal(month.absenceDays)}` : ""}
        {month.unpaidDays + month.overtimeReductionDays > 0 ? (
          <span
            className="block text-xs"
            title="Unbezahlt (kein Soll) · Überstundenabbau (Soll bleibt)"
          >
            {[
              month.unpaidDays > 0
                ? `${formatDecimal(month.unpaidDays)} unbez.`
                : null,
              month.overtimeReductionDays > 0
                ? `${formatDecimal(month.overtimeReductionDays)} Abbau`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
      </span>
      <span className="hidden text-right text-muted-foreground md:block">
        <Duration minutes={hoursToMinutes(month.targetHours)} />
      </span>
      <span className="hidden text-right md:block">
        <Duration minutes={hoursToMinutes(month.expectedHours)} />
      </span>
      <span className="num hidden text-right md:block">
        {month.expectedBillableHours !== null
          ? formatHours(month.expectedBillableHours)
          : "—"}
      </span>
      <span className="hidden text-right md:block">
        <Delta minutes={hoursToMinutes(month.deltaHours)} />
      </span>
      <span className="hidden text-right md:block">
        <Delta minutes={hoursToMinutes(month.balanceHours)} />
      </span>
    </li>
  );
}

export function ForecastControls({
  todayKey,
  horizon,
  base,
  onHorizon,
  onBase,
}: {
  todayKey: string;
  horizon: ForecastHorizon;
  base: BaseMonthCount;
  onHorizon: (value: ForecastHorizon) => void;
  onBase: (value: BaseMonthCount) => void;
}) {
  const year = Number(todayKey.slice(0, 4));
  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-6">
      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground">
          Zeitraum: Rest des Jahres plus
        </div>
        <FilterChips
          ariaLabel="Prognose-Horizont"
          value={String(horizon)}
          onChange={(value) => onHorizon(Number(value) as ForecastHorizon)}
          options={FORECAST_HORIZONS.map((h) => ({
            value: String(h),
            label: `${h} Monate · bis ${monthShortWithYear(forecastEndMonth(todayKey, h), year)}`,
          }))}
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-xs text-muted-foreground">
          Erfahrungswerte aus den letzten
        </div>
        <FilterChips
          ariaLabel="Basis-Monate"
          value={String(base)}
          onChange={(value) => onBase(Number(value) as BaseMonthCount)}
          options={BASE_MONTH_OPTIONS.map((b) => ({
            value: String(b),
            label: `${b} Monaten`,
          }))}
        />
      </div>
    </div>
  );
}

export function ForecastSection({ data }: { data: ForecastResponse }) {
  const { forecast, schedule, holidays } = data;
  const { baseline, totals } = forecast;
  const referenceYear = Number(forecast.todayKey.slice(0, 4));

  const skippedMonths = baseline.consideredMonths.filter(
    (month) => !baseline.months.some((m) => m.month === month),
  );
  const bulkFillDays = baseline.months.reduce(
    (sum, m) => sum + m.bulkFillDays,
    0,
  );
  const baseWork =
    baseline.billableHours +
    baseline.nonBillableHours +
    baseline.unknownBillingHours;

  const points: BalancePoint[] = [
    {
      key: "today",
      label: "Heute",
      title: `Heute, ${formatDayMonth(forecast.todayKey)}`,
      balance: hoursToMinutes(forecast.startBalance),
    },
    ...forecast.months.map((month) => ({
      key: month.month,
      label: monthShortWithYear(month.month, referenceYear),
      title:
        month.kind === "current"
          ? `Ende ${monthLabel(month.month)} (Rest prognostiziert)`
          : `Ende ${monthLabel(month.month)}`,
      balance: hoursToMinutes(month.balanceHours),
      delta: hoursToMinutes(month.deltaHours),
      actual: hoursToMinutes(month.expectedHours),
      target: hoursToMinutes(month.targetHours),
      actualLabel: "Erwartet",
    })),
  ];

  return (
    <div className="space-y-4">
      <StatStrip>
        <Stat
          label={`Saldo Ende ${monthLabel(forecast.endMonth)}`}
          emphasis
          tone={tone(forecast.endBalance)}
          value={formatHoursDelta(forecast.endBalance)}
          hint={`heute ${formatHoursDelta(forecast.startBalance)}, Veränderung ${formatHoursDelta(totals.deltaHours)}`}
        />
        <Stat
          label="Erwartet gearbeitet"
          value={formatHours(totals.expectedHours)}
          hint={`von ${formatHours(totals.targetHours)} Soll`}
        />
        <Stat
          label="Erwartet abrechenbar"
          value={
            totals.expectedBillableHours !== null
              ? formatHours(totals.expectedBillableHours)
              : "—"
          }
          hint={
            forecast.billableQuote !== null
              ? `Quote ${formatPercent(forecast.billableQuote)}`
              : "keine Quote ermittelbar"
          }
        />
        <Stat
          label="Ø je Arbeitstag"
          value={formatHours(forecast.hoursPerDay)}
          hint={
            forecast.usedFallback
              ? "Tagessoll, keine Erfahrungswerte"
              : `Tagessoll ${formatHours(forecast.dailyTargetHours)}`
          }
        />
      </StatStrip>

      <Panel>
        <PanelHeader
          title="Saldo-Prognose"
          meta="gestrichelt: erwarteter Saldo am Monatsende"
        />
        <PanelBody>
          <BalanceChart
            points={points}
            dashed
            ariaLabel={`Erwarteter Saldo bis ${monthLabel(forecast.endMonth)}`}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Monate"
          meta={`Feiertage: ${totals.holidayDays} · geplanter Urlaub/Krank: ${formatDecimal(totals.absenceDays)}${totals.unpaidDays > 0 ? ` · unbezahlt: ${formatDecimal(totals.unpaidDays)}` : ""}${totals.overtimeReductionDays > 0 ? ` · Überstundenabbau: ${formatDecimal(totals.overtimeReductionDays)}` : ""}`}
        />
        <div
          className={cn(
            "hidden border-b px-4 py-2 text-xs text-muted-foreground",
            ROW_GRID,
          )}
          aria-hidden="true"
        >
          <span>Monat</span>
          <span className="text-right">Tage</span>
          <span className="text-right">Feiert. · Urlaub</span>
          <span className="text-right">Soll</span>
          <span className="text-right">Erwartet</span>
          <span className="text-right">Abrechenbar</span>
          <span className="text-right">Differenz</span>
          <span className="text-right">Saldo</span>
        </div>
        <ul className="divide-y">
          {forecast.months.map((month) => (
            <MonthRow key={month.month} month={month} names={holidays.names} />
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader title="Annahmen" />
        <PanelBody className="space-y-4">
          {baseline.months.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="mb-2 text-left text-xs text-muted-foreground">
                  Basis: {baseline.months.length} von{" "}
                  {baseline.consideredMonths.length} abgeschlossenen Monaten mit
                  Daten
                </caption>
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-1.5 text-left font-normal">Monat</th>
                    <th className="py-1.5 text-right font-normal">
                      Gearbeitet
                    </th>
                    <th className="py-1.5 text-right font-normal">
                      <span className="md:hidden">Tage</span>
                      <span className="hidden md:inline">Verfügbare Tage</span>
                    </th>
                    <th className="py-1.5 text-right font-normal">Ø / Tag</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {baseline.months.map((m) => (
                    <tr key={m.month}>
                      <td className="py-1.5">
                        {monthLabel(m.month)}
                        {m.from !== `${m.month}-01` ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ab {formatDayMonth(m.from)}
                          </span>
                        ) : null}
                      </td>
                      <td className="num py-1.5 text-right">
                        {formatHours(m.workHours)}
                      </td>
                      <td className="num py-1.5 text-right">
                        {m.availableDays}
                      </td>
                      <td className="num py-1.5 text-right">
                        {m.hoursPerDay !== null
                          ? formatHours(m.hoursPerDay)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <ul className="space-y-2 text-[13px] text-muted-foreground">
            {forecast.usedFallback ? (
              <Notice warning>
                In den letzten {baseline.consideredMonths.length}{" "}
                abgeschlossenen Monaten gibt es keine erfasste Arbeit. Die
                Prognose nimmt deshalb das Tagessoll an; Abweichungen entstehen
                nur durch den aktuellen Saldo.
              </Notice>
            ) : (
              <Notice>
                Erwartet gearbeitet = Ø{" "}
                <span className="num text-foreground">
                  {formatDuration(hoursToMinutes(forecast.hoursPerDay))}
                </span>{" "}
                je verfügbarem Arbeitstag × verfügbare Tage. Verfügbar sind
                Arbeitstage ohne Feiertage, Urlaub und Krankheit; Arbeit am
                Wochenende fließt in den Schnitt ein.
                {skippedMonths.length > 0
                  ? ` Ohne Daten und deshalb ausgelassen: ${skippedMonths.map(monthLabel).join(", ")}.`
                  : ""}
              </Notice>
            )}
            <Notice>
              Soll = verfügbare Tage × Tagessoll{" "}
              <span className="num text-foreground">
                {formatHours(forecast.dailyTargetHours)}
              </span>{" "}
              ({formatDecimal(schedule.weeklyHours, 2)} h/Woche,{" "}
              {formatWorkDays(schedule.workDays)}).{" "}
              <Link href="/settings/overtime" className="underline">
                Arbeitszeit einstellen
              </Link>
            </Notice>
            <Notice>
              {forecast.billableQuote !== null ? (
                <>
                  Abrechnungsquote{" "}
                  <span className="num text-foreground">
                    {formatPercent(forecast.billableQuote)}
                  </span>
                  : {formatHours(baseline.billableHours)} abrechenbar von{" "}
                  {formatHours(baseWork)} Arbeit in der Basis
                  {baseline.unknownBillingHours > 0
                    ? `, davon ${formatHours(baseline.unknownBillingHours)} ohne Status`
                    : ""}
                  . Gleiche Definition wie im Abrechnungsbericht (abrechenbar
                  von gesamt); Auffüllungen zählen hier nicht mit, Stunden sind
                  auf Viertelstunden gerundet.
                </>
              ) : (
                <>
                  Keine Abrechnungsquote: In der Basis hat kein Eintrag einen
                  Abrechnungsstatus aus Timing.
                </>
              )}
            </Notice>
            <Notice>
              Auffüllungen zählen nicht als Erfahrungswert
              {bulkFillDays > 0
                ? `; ${formatDayCount(bulkFillDays)} nur aufgefüllt, aus der Basis genommen`
                : ""}
              . Der aktuelle Saldo enthält das Soll von heute, aber nur die
              bisher erfasste Arbeit. Die Prognose ergänzt deshalb den Rest von
              heute (Ø je Tag minus bisher erfasst) und rechnet ab morgen
              weiter.
            </Notice>
            <Notice>
              Feiertage (Niedersachsen) kommen aus dem Feiertags-Dienst und den
              importierten Feiertagen. Geplanter Urlaub und Krankheit zählen
              nur, wenn sie als Eintrag mit zukünftigem Datum vorliegen
              {totals.absenceDays === 0 ? " – derzeit keiner" : ""}. Unbezahlte
              Tage haben kein Soll; Überstundenabbau behält das Soll, ohne dass
              Arbeit erwartet wird.
            </Notice>
            {holidays.unavailableYears.length > 0 ? (
              <Notice warning>
                Der Feiertags-Dienst war für{" "}
                {holidays.unavailableYears.join(", ")} nicht erreichbar; dort
                sind nur importierte Feiertage berücksichtigt.
              </Notice>
            ) : null}
          </ul>
        </PanelBody>
      </Panel>
    </div>
  );
}
