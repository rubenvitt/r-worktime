"use client";

import { FilterChips } from "@/components/app/filter-chips";
import { PeriodNav } from "@/components/app/period-nav";
import {
  isFuturePeriod,
  isSamePeriod,
  PERIOD_KIND_OPTIONS,
  PERIOD_NAV_LABELS,
  type PeriodKind,
  periodContaining,
  periodLabel,
  periodShortLabel,
  type ReportPeriod,
  shiftPeriod,
} from "@/lib/reports/period";

/** Blättern durch Monat, Quartal oder Jahr; Zukunft ist gesperrt. */
export function ReportPeriodNav({
  period,
  todayKey,
  onChange,
}: {
  period: ReportPeriod;
  todayKey: string;
  onChange: (next: ReportPeriod) => void;
}) {
  const labels = PERIOD_NAV_LABELS[period.kind];
  const current = periodContaining(period.kind, todayKey);
  const next = shiftPeriod(period, 1);
  return (
    <PeriodNav
      label={periodLabel(period)}
      shortLabel={periodShortLabel(period)}
      onPrev={() => onChange(shiftPeriod(period, -1))}
      onNext={() => onChange(next)}
      onToday={() => onChange(current)}
      isCurrent={isSamePeriod(period, current)}
      nextDisabled={isFuturePeriod(next, todayKey)}
      prevLabel={labels.prev}
      nextLabel={labels.next}
      todayLabel={labels.today}
    />
  );
}

/** Auswahl Monat/Quartal/Jahr (optional mit weiteren Arten, z. B. „90 Tage“). */
export function PeriodKindChips<T extends string = PeriodKind>({
  value,
  onChange,
  extraOptions = [],
}: {
  value: PeriodKind | T;
  onChange: (kind: PeriodKind | T) => void;
  extraOptions?: Array<{ value: T; label: string }>;
}) {
  return (
    <FilterChips<PeriodKind | T>
      ariaLabel="Zeitraum"
      value={value}
      onChange={onChange}
      options={[...PERIOD_KIND_OPTIONS, ...extraOptions]}
    />
  );
}

/** Blättern durch Jahre; `maxYear` begrenzt die Zukunft. */
export function ReportYearNav({
  year,
  currentYear,
  maxYear,
  onChange,
}: {
  year: number;
  currentYear: number;
  maxYear: number;
  onChange: (year: number) => void;
}) {
  const labels = PERIOD_NAV_LABELS.year;
  return (
    <PeriodNav
      label={String(year)}
      onPrev={() => onChange(year - 1)}
      onNext={() => onChange(year + 1)}
      onToday={() => onChange(currentYear)}
      isCurrent={year === currentYear}
      nextDisabled={year >= maxYear}
      prevLabel={labels.prev}
      nextLabel={labels.next}
      todayLabel={labels.today}
    />
  );
}
