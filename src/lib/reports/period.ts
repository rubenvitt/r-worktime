// Gemeinsame Zeiträume der Berichte: Monat "2026-10", Quartal "2026-Q4",
// Jahr "2026". Reine Kalenderrechnung ohne Server-Abhängigkeiten, deshalb in
// API-Routen und im Client nutzbar. „Heute“ ist immer der Berliner Kalendertag.
// In der URL stehen Zeiträume einheitlich als ?period=<Art>&key=<Schlüssel>.

import {
  berlinTodayKey,
  monthRange,
  monthsEndingAt,
  shiftMonthKey,
} from "@/lib/dates";
import { formatMonth } from "@/lib/format";

export const PERIOD_KINDS = ["month", "quarter", "year"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export const PERIOD_KIND_LABELS: Record<PeriodKind, string> = {
  month: "Monat",
  quarter: "Quartal",
  year: "Jahr",
};

/** Beschriftung der Vor/Zurück/Heute-Schaltflächen in PeriodNav. */
export const PERIOD_NAV_LABELS: Record<
  PeriodKind,
  { prev: string; next: string; today: string }
> = {
  month: {
    prev: "Vorheriger Monat",
    next: "Nächster Monat",
    today: "Dieser Monat",
  },
  quarter: {
    prev: "Vorheriges Quartal",
    next: "Nächstes Quartal",
    today: "Dieses Quartal",
  },
  year: {
    prev: "Vorheriges Jahr",
    next: "Nächstes Jahr",
    today: "Dieses Jahr",
  },
};

/** Auswahl der Zeitraum-Art für FilterChips. */
export const PERIOD_KIND_OPTIONS: Array<{ value: PeriodKind; label: string }> =
  PERIOD_KINDS.map((kind) => ({
    value: kind,
    label: PERIOD_KIND_LABELS[kind],
  }));

/** Gültiger Jahresbereich für Berichte (schützt vor Unsinn in der URL). */
export const MIN_REPORT_YEAR = 2000;
export const MAX_REPORT_YEAR = 2100;

export interface ReportPeriod {
  kind: PeriodKind;
  /** "2026-10", "2026-Q4" oder "2026" */
  key: string;
}

const KEY_PATTERNS: Record<PeriodKind, RegExp> = {
  month: /^(\d{4})-(0[1-9]|1[0-2])$/,
  quarter: /^(\d{4})-Q([1-4])$/,
  year: /^(\d{4})$/,
};

const MONTHS_PER_KIND: Record<PeriodKind, number> = {
  month: 1,
  quarter: 3,
  year: 12,
};

const shortMonthFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  month: "short",
});

export function isPeriodKind(
  value: string | null | undefined,
): value is PeriodKind {
  return (PERIOD_KINDS as readonly string[]).includes(value ?? "");
}

/** Jahreszahl "2026" im erlaubten Bereich, sonst null. */
export function parseReportYear(
  value: string | null | undefined,
): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= MIN_REPORT_YEAR && year <= MAX_REPORT_YEAR ? year : null;
}

/** Zeitraum aus Art und Schlüssel; null bei ungültigen Werten. */
export function parsePeriod(
  kind: string | null | undefined,
  key: string | null | undefined,
): ReportPeriod | null {
  if (!isPeriodKind(kind) || !key) return null;
  if (!KEY_PATTERNS[kind].test(key)) return null;
  if (parseReportYear(key.slice(0, 4)) === null) return null;
  return { kind, key };
}

/** Erster Monat des Zeitraums, "YYYY-MM". */
function firstMonth(period: ReportPeriod): string {
  const year = period.key.slice(0, 4);
  if (period.kind === "month") return period.key;
  if (period.kind === "quarter") {
    const quarter = Number(period.key.slice(6));
    return `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}`;
  }
  return `${year}-01`;
}

/** Zeitraum der Art `kind`, der den Kalendertag `dayKey` ("YYYY-MM-DD") enthält. */
export function periodContaining(
  kind: PeriodKind,
  dayKey: string,
): ReportPeriod {
  const year = dayKey.slice(0, 4);
  if (kind === "year") return { kind, key: year };
  if (kind === "month") return { kind, key: dayKey.slice(0, 7) };
  const quarter = Math.floor((Number(dayKey.slice(5, 7)) - 1) / 3) + 1;
  return { kind, key: `${year}-Q${quarter}` };
}

/** Laufender Zeitraum in Berlin. */
export function currentPeriod(
  kind: PeriodKind,
  now: Date = new Date(),
): ReportPeriod {
  return periodContaining(kind, berlinTodayKey(now));
}

/** Alle Monate "YYYY-MM" des Zeitraums, aufsteigend. */
export function periodMonths(period: ReportPeriod): string[] {
  const first = firstMonth(period);
  return Array.from({ length: MONTHS_PER_KIND[period.kind] }, (_, i) =>
    shiftMonthKey(first, i),
  );
}

/** Erster und letzter Kalendertag (inklusive). */
export function periodBounds(period: ReportPeriod): {
  firstKey: string;
  lastKey: string;
} {
  const months = periodMonths(period);
  return {
    firstKey: monthRange(months[0]).firstKey,
    lastKey: monthRange(months[months.length - 1]).lastKey,
  };
}

/** Verschiebt um n Einheiten der eigenen Art (Monat, Quartal, Jahr). */
export function shiftPeriod(period: ReportPeriod, delta: number): ReportPeriod {
  const month = shiftMonthKey(
    firstMonth(period),
    delta * MONTHS_PER_KIND[period.kind],
  );
  return periodContaining(period.kind, `${month}-01`);
}

/**
 * Wechsel der Art, ohne den angezeigten Zeitraum zu verlassen: enthält er
 * heute, gilt der laufende Zeitraum der neuen Art, sonst sein erster Tag.
 */
export function convertPeriod(
  period: ReportPeriod,
  kind: PeriodKind,
  todayKey: string = berlinTodayKey(),
): ReportPeriod {
  if (kind === period.kind) return period;
  const { firstKey, lastKey } = periodBounds(period);
  const anchor =
    firstKey <= todayKey && todayKey <= lastKey ? todayKey : firstKey;
  return periodContaining(kind, anchor);
}

export function isSamePeriod(a: ReportPeriod, b: ReportPeriod): boolean {
  return a.kind === b.kind && a.key === b.key;
}

/** Beginnt nach dem Kalendertag `todayKey` – dort gibt es noch keine Arbeitszeit. */
export function isFuturePeriod(
  period: ReportPeriod,
  todayKey: string,
): boolean {
  return periodBounds(period).firstKey > todayKey;
}

/** Anzahl Monate in den Verlaufsdiagrammen. */
export const TREND_MONTHS = 12;

/** Verlaufsfenster: count Monate bis zum Ende des Zeitraums, höchstens bis heute. */
export function trendWindow(
  period: ReportPeriod,
  todayKey: string = berlinTodayKey(),
  count: number = TREND_MONTHS,
): string[] {
  const months = periodMonths(period);
  const lastOfPeriod = months[months.length - 1];
  const current = todayKey.slice(0, 7);
  return monthsEndingAt(lastOfPeriod < current ? lastOfPeriod : current, count);
}

/** "2026-10" → "Okt" (ohne Punkt) */
export function shortMonthName(month: string): string {
  return shortMonthFormatter
    .format(new Date(`${month}-01T12:00:00Z`))
    .replace(".", "");
}

/** „Oktober 2026“, „4. Quartal 2026“, „2026“ */
export function periodLabel(period: ReportPeriod): string {
  if (period.kind === "month") return formatMonth(period.key);
  if (period.kind === "quarter") {
    return `${period.key.slice(6)}. Quartal ${period.key.slice(0, 4)}`;
  }
  return period.key;
}

/** „Okt 2026“, „Q4 2026“, „2026“ (für schmale Bildschirme) */
export function periodShortLabel(period: ReportPeriod): string {
  if (period.kind === "month") {
    return `${shortMonthName(period.key)} ${period.key.slice(0, 4)}`;
  }
  if (period.kind === "quarter") {
    return `Q${period.key.slice(6)} ${period.key.slice(0, 4)}`;
  }
  return period.key;
}

/** Für Fließtext: „im Oktober 2026“, „im 4. Quartal 2026“, „im Jahr 2026“ */
export function periodPhrase(period: ReportPeriod): string {
  if (period.kind === "year") return `im Jahr ${period.key}`;
  return `im ${periodLabel(period)}`;
}

/** Zeitraum mit Beschriftung und Grenzen, wie ihn die Berichts-APIs zurückgeben. */
export interface DescribedPeriod extends ReportPeriod {
  label: string;
  shortLabel: string;
  /** Erster Tag, "YYYY-MM-DD" */
  firstKey: string;
  /** Letzter Tag, "YYYY-MM-DD" (inklusive) */
  lastKey: string;
}

export function describePeriod(period: ReportPeriod): DescribedPeriod {
  return {
    kind: period.kind,
    key: period.key,
    label: periodLabel(period),
    shortLabel: periodShortLabel(period),
    ...periodBounds(period),
  };
}

/** Liest ?period=<Art>&key=<Schlüssel>; null, wenn etwas fehlt oder ungültig ist. */
export function parsePeriodParams(
  params: URLSearchParams,
): ReportPeriod | null {
  return parsePeriod(params.get("period"), params.get("key"));
}

/** Gegenstück zu parsePeriodParams. */
export function periodSearchParams(period: ReportPeriod): URLSearchParams {
  return new URLSearchParams({ period: period.kind, key: period.key });
}
