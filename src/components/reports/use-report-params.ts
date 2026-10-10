"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { berlinTodayKey } from "@/lib/dates";
import {
  isPeriodKind,
  MIN_REPORT_YEAR,
  type PeriodKind,
  parsePeriodParams,
  parseReportYear,
  periodContaining,
  type ReportPeriod,
} from "@/lib/reports/period";

/**
 * Query-Parameter der Berichtsseite lesen und ändern. `null` entfernt einen
 * Parameter; alle übrigen bleiben erhalten. Ersetzt den Verlaufseintrag.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [name, value] of Object.entries(patch)) {
        if (value === null) params.delete(name);
        else params.set(name, value);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  return { searchParams, update };
}

/**
 * Zeitraum aus ?period=<Art>&key=<Schlüssel>. Fehlt der Schlüssel oder ist er
 * ungültig, gilt der laufende Zeitraum der Art (Standard: Monat).
 */
export function useReportPeriod(defaultKind: PeriodKind = "month") {
  const { searchParams, update } = useUrlParams();
  const todayKey = berlinTodayKey();
  const rawKind = searchParams.get("period");
  const period: ReportPeriod =
    parsePeriodParams(searchParams) ??
    periodContaining(isPeriodKind(rawKind) ? rawKind : defaultKind, todayKey);

  const setPeriod = useCallback(
    (next: ReportPeriod) => update({ period: next.kind, key: next.key }),
    [update],
  );

  return { period, setPeriod, todayKey, searchParams, update };
}

/** Jahr aus ?year=; außerhalb von 2000 bis `maxYear` gilt das laufende Jahr. */
export function useReportYear(options: { maxOffset?: number } = {}) {
  const { searchParams, update } = useUrlParams();
  const todayKey = berlinTodayKey();
  const currentYear = Number(todayKey.slice(0, 4));
  const maxYear = currentYear + (options.maxOffset ?? 0);
  const parsed = parseReportYear(searchParams.get("year"));
  const year =
    parsed !== null && parsed >= MIN_REPORT_YEAR && parsed <= maxYear
      ? parsed
      : currentYear;

  const setYear = useCallback(
    (next: number) => update({ year: String(next) }),
    [update],
  );

  return {
    year,
    setYear,
    currentYear,
    maxYear,
    todayKey,
    searchParams,
    update,
  };
}
