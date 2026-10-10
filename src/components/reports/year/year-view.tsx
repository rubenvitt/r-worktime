"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/app/error-state";
import {
  RefetchBar,
  SkeletonPanel,
  SkeletonStatStrip,
} from "@/components/app/skeletons";
import { fetchJson } from "@/components/reports/fetch-json";
import { ReportHeader } from "@/components/reports/report-header";
import { ReportYearNav } from "@/components/reports/report-period-nav";
import {
  useReportYear,
  useUrlParams,
} from "@/components/reports/use-report-params";
import {
  type BaseMonthCount,
  DEFAULT_BASE_MONTHS,
  DEFAULT_FORECAST_HORIZON,
  type ForecastHorizon,
  isBaseMonthCount,
  isForecastHorizon,
} from "@/lib/reports/forecast";
import type { ForecastResponse, YearReportResponse } from "./api-types";
import { ForecastControls, ForecastSection } from "./forecast-section";
import { YearSection } from "./year-section";

/** Horizont und Basis der Prognose liegen in der URL (?horizon, ?base). */
function useForecastParams() {
  const { searchParams, update } = useUrlParams();
  const rawHorizon = Number(searchParams.get("horizon"));
  const horizon: ForecastHorizon = isForecastHorizon(rawHorizon)
    ? rawHorizon
    : DEFAULT_FORECAST_HORIZON;
  const rawBase = Number(searchParams.get("base"));
  const base: BaseMonthCount = isBaseMonthCount(rawBase)
    ? rawBase
    : DEFAULT_BASE_MONTHS;
  return {
    horizon,
    base,
    setHorizon: (value: ForecastHorizon) =>
      update({
        horizon: value === DEFAULT_FORECAST_HORIZON ? null : String(value),
      }),
    setBase: (value: BaseMonthCount) =>
      update({ base: value === DEFAULT_BASE_MONTHS ? null : String(value) }),
  };
}

export function YearView() {
  const { year, setYear, currentYear, maxYear, todayKey } = useReportYear();
  const { horizon, base, setHorizon, setBase } = useForecastParams();

  const yearQuery = useQuery({
    queryKey: ["reports", "year", year],
    queryFn: () =>
      fetchJson<YearReportResponse>(
        `/api/reports/year?year=${year}`,
        "Jahresübersicht konnte nicht geladen werden",
      ),
    placeholderData: keepPreviousData,
  });

  const forecastQuery = useQuery({
    queryKey: ["reports", "forecast", horizon, base],
    queryFn: () =>
      fetchJson<ForecastResponse>(
        `/api/reports/forecast?horizon=${horizon}&base=${base}`,
        "Prognose konnte nicht geladen werden",
      ),
    placeholderData: keepPreviousData,
  });

  const yearData = yearQuery.data;
  const yearStale = Boolean(yearData && yearData.report.year !== year);
  const forecastData = forecastQuery.data;
  const forecastStale = Boolean(
    forecastData &&
      (forecastData.forecast.horizon !== horizon ||
        forecastData.forecast.baseline.consideredMonths.length !== base),
  );

  return (
    <>
      <ReportHeader
        report="year"
        period={
          <ReportYearNav
            year={year}
            currentYear={currentYear}
            maxYear={maxYear}
            onChange={setYear}
          />
        }
      />

      <div className="space-y-10">
        <section aria-labelledby="year-heading" className="space-y-4">
          <h2 id="year-heading" className="text-base font-semibold">
            Jahresübersicht {year}
          </h2>
          {yearQuery.isPending ? (
            <div className="space-y-4" aria-busy="true">
              <SkeletonStatStrip tiles={4} />
              <SkeletonPanel lines={5} />
            </div>
          ) : yearQuery.isError && !yearData ? (
            <ErrorState
              title="Jahresübersicht konnte nicht geladen werden"
              error={yearQuery.error}
              onRetry={() => yearQuery.refetch()}
            />
          ) : yearData ? (
            <>
              <RefetchBar active={yearQuery.isFetching && yearStale} />
              {yearQuery.isError ? (
                <ErrorState
                  title={`Daten für ${year} konnten nicht geladen werden`}
                  error={yearQuery.error}
                  onRetry={() => yearQuery.refetch()}
                />
              ) : null}
              <YearSection data={yearData} />
            </>
          ) : null}
        </section>

        <section aria-labelledby="forecast-heading" className="space-y-4">
          <div className="space-y-1">
            <h2 id="forecast-heading" className="text-base font-semibold">
              Prognose ab heute
            </h2>
            <p className="max-w-prose text-[13px] text-muted-foreground">
              Unabhängig vom gewählten Jahr: vom aktuellen Saldo aus, mit
              Feiertagen, geplantem Urlaub und dem Schnitt der letzten Monate.
            </p>
          </div>
          <ForecastControls
            todayKey={todayKey}
            horizon={horizon}
            base={base}
            onHorizon={setHorizon}
            onBase={setBase}
          />
          {forecastQuery.isPending ? (
            <div className="space-y-4" aria-busy="true">
              <SkeletonStatStrip tiles={4} />
              <SkeletonPanel lines={8} />
            </div>
          ) : forecastQuery.isError && !forecastData ? (
            <ErrorState
              title="Prognose konnte nicht geladen werden"
              error={forecastQuery.error}
              onRetry={() => forecastQuery.refetch()}
            />
          ) : forecastData ? (
            <>
              <RefetchBar active={forecastQuery.isFetching && forecastStale} />
              {forecastQuery.isError ? (
                <ErrorState
                  title="Prognose konnte nicht aktualisiert werden"
                  error={forecastQuery.error}
                  onRetry={() => forecastQuery.refetch()}
                />
              ) : null}
              <ForecastSection data={forecastData} />
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}
