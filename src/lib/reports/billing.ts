// Abrechnung nach Status: reine Aggregation über Zeiteinträge.
//
// Regeln:
// - Es zählen nur Arbeitseinträge (WORK, OVERTIME) ohne den Anfangssaldo.
//   Urlaub, Krankheit und Feiertage tragen zwar teils einen Status (Demo-Seed:
//   "unbilled"), sind aber keine abrechenbare Arbeit.
// - Aufgefüllte Tage (BULK_FILL) sind Arbeit ohne Status und landen bei
//   „Ohne Status“; ihr Anteil wird getrennt ausgewiesen.
// - Zugeordnet wird nach dem Berliner Kalendertag des Starts – wie beim
//   Stundenzettel, aus dem abgerechnet wird.
// - Gerechnet wird in ganzen Minuten, ohne Rundung je Eintrag.
//
// Rein und Prisma-frei; der Client nutzt vor allem die Typen.

import { isAdjustmentEntry } from "@/lib/adjustment-marker";
import { berlinDateKey, berlinTodayKey } from "@/lib/dates";
import { hoursToMinutes } from "@/lib/format";
import { WORK_TYPES } from "@/lib/timesheet/entries";
import {
  PROJECT_PATH_SEPARATOR,
  splitProjectPath,
} from "@/lib/timing/project-path";
import {
  BILLING_STATUS_CLASS,
  BILLING_STATUS_LABELS,
  BILLING_STATUS_ORDER,
  type BillingClass,
  type BillingStatus,
  billableShare,
  classifyBillingStatus,
  normalizeBillingStatus,
} from "./billing-status";
import {
  type DescribedPeriod,
  describePeriod,
  isPeriodKind,
  type PeriodKind,
  parsePeriod,
  periodBounds,
  periodContaining,
  type ReportPeriod,
  trendWindow,
} from "./period";

export const NO_PROJECT = "Ohne Projekt";

/** Ab diesem Anteil „Ohne Status“ zeigt die Seite einen Hinweis. */
export const UNKNOWN_SHARE_HINT_THRESHOLD = 0.1;

export const MAX_PROJECT_DEPTH = 4;

/** Ausschnitt einer TimeEntry-Zeile für den Bericht. */
export interface BillingSourceEntry {
  startTime: Date;
  /** Stunden laut duration-Spalte */
  duration: number;
  type: string;
  source: string;
  description: string | null;
  billingStatus: string | null;
  projectPath: string | null;
}

type RelevanceFields = Pick<
  BillingSourceEntry,
  "type" | "source" | "description"
>;

const WORK_TYPE_SET = new Set<string>(WORK_TYPES);

/** true für echte Arbeit: WORK/OVERTIME, kein Anfangssaldo. */
export function isBillingRelevant(entry: RelevanceFields): boolean {
  return WORK_TYPE_SET.has(entry.type) && !isAdjustmentEntry(entry);
}

/**
 * Arbeitsstunden nach Klasse (für die Monatsstatistik). Erwartet bereits
 * gerundete Stunden je Eintrag; Nicht-Arbeit wird ignoriert.
 */
export function splitHoursByBillingClass(
  entries: Array<
    RelevanceFields & { billingStatus: string | null; hours: number }
  >,
): Record<BillingClass, number> {
  const result: Record<BillingClass, number> = {
    billable: 0,
    nonBillable: 0,
    unknown: 0,
  };
  for (const entry of entries) {
    if (!isBillingRelevant(entry)) continue;
    result[classifyBillingStatus(entry.billingStatus)] += entry.hours;
  }
  return result;
}

/** Projektgruppe bis zur gewünschten Ebene; leere Pfade → „Ohne Projekt“. */
export function projectGroup(path: string | null, depth: number): string {
  const segments = path ? splitProjectPath(path) : [];
  if (segments.length === 0) return NO_PROJECT;
  return segments.slice(0, Math.max(1, depth)).join(PROJECT_PATH_SEPARATOR);
}

export interface BillingRawValue {
  /** Rohwert aus der Quelle, Schreibweise unverändert; null = kein Wert */
  raw: string | null;
  minutes: number;
  entryCount: number;
}

export interface BillingProjectRow {
  name: string;
  minutes: number;
  /** Anteil am Status (0–1) */
  share: number;
}

export interface BillingStatusRow {
  status: BillingStatus;
  label: string;
  billingClass: BillingClass;
  minutes: number;
  entryCount: number;
  /** Anteil an allen Arbeitsstunden (0–1); null ohne Stunden */
  share: number | null;
  rawValues: BillingRawValue[];
  projects: BillingProjectRow[];
}

export interface BillingTotals {
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  unknownMinutes: number;
  /** davon aus Auffüllung (immer „Ohne Status“) */
  bulkFillMinutes: number;
  entryCount: number;
  /** abrechenbar / gesamt */
  billableShare: number | null;
  /** abrechenbar / (abrechenbar + nicht abrechenbar) */
  classifiedShare: number | null;
  /** ohne Status / gesamt */
  unknownShare: number | null;
}

export interface BillingTrendPoint {
  /** "YYYY-MM" */
  month: string;
  billableMinutes: number;
  nonBillableMinutes: number;
  unknownMinutes: number;
  totalMinutes: number;
  /** abrechenbar / gesamt; null ohne Stunden */
  billableShare: number | null;
}

export interface BillingReport {
  period: DescribedPeriod;
  /** Ebene der Projektgruppen (1 = oberste) */
  depth: number;
  totals: BillingTotals;
  /** Alle Status in fester Reihenfolge, auch ohne Stunden */
  statuses: BillingStatusRow[];
  trend: BillingTrendPoint[];
  /** Anteil „Ohne Status“ erreicht die Hinweis-Schwelle */
  showUnknownHint: boolean;
}

export interface BuildBillingReportOptions {
  period: ReportPeriod;
  depth?: number;
  /** Berliner Kalendertag „heute“; begrenzt das Ende des Verlaufs */
  todayKey?: string;
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

interface StatusAccumulator {
  minutes: number;
  entryCount: number;
  raw: Map<string | null, BillingRawValue>;
  projects: Map<string, number>;
}

function emptyClassMinutes(): Record<BillingClass, number> {
  return { billable: 0, nonBillable: 0, unknown: 0 };
}

export function buildBillingReport(
  entries: BillingSourceEntry[],
  options: BuildBillingReportOptions,
): BillingReport {
  const { period } = options;
  const depth = Math.min(
    MAX_PROJECT_DEPTH,
    Math.max(1, Math.floor(options.depth ?? 1)),
  );
  const { firstKey, lastKey } = periodBounds(period);
  const months = trendWindow(period, options.todayKey ?? berlinTodayKey());
  const trendByMonth = new Map(months.map((m) => [m, emptyClassMinutes()]));

  const statusAcc = new Map<BillingStatus, StatusAccumulator>(
    BILLING_STATUS_ORDER.map((status) => [
      status,
      { minutes: 0, entryCount: 0, raw: new Map(), projects: new Map() },
    ]),
  );
  const classMinutes = emptyClassMinutes();
  let bulkFillMinutes = 0;
  let entryCount = 0;

  for (const entry of entries) {
    if (!isBillingRelevant(entry)) continue;
    if (Number.isNaN(entry.startTime.getTime())) continue;

    const dayKey = berlinDateKey(entry.startTime);
    const minutes = hoursToMinutes(entry.duration);
    const status = normalizeBillingStatus(entry.billingStatus);
    const billingClass = BILLING_STATUS_CLASS[status];

    const trend = trendByMonth.get(dayKey.slice(0, 7));
    if (trend) trend[billingClass] += minutes;

    if (dayKey < firstKey || dayKey > lastKey) continue;

    entryCount += 1;
    classMinutes[billingClass] += minutes;
    if (entry.source === "BULK_FILL") bulkFillMinutes += minutes;

    const acc = statusAcc.get(status);
    if (!acc) continue;
    acc.minutes += minutes;
    acc.entryCount += 1;

    // Leerer String und null sind beide „kein Wert“
    const raw = entry.billingStatus?.trim() ? entry.billingStatus : null;
    const rawRow = acc.raw.get(raw) ?? { raw, minutes: 0, entryCount: 0 };
    rawRow.minutes += minutes;
    rawRow.entryCount += 1;
    acc.raw.set(raw, rawRow);

    const group = projectGroup(entry.projectPath, depth);
    acc.projects.set(group, (acc.projects.get(group) ?? 0) + minutes);
  }

  const totalMinutes =
    classMinutes.billable + classMinutes.nonBillable + classMinutes.unknown;

  const statuses: BillingStatusRow[] = BILLING_STATUS_ORDER.map((status) => {
    const acc = statusAcc.get(status) as StatusAccumulator;
    return {
      status,
      label: BILLING_STATUS_LABELS[status],
      billingClass: BILLING_STATUS_CLASS[status],
      minutes: acc.minutes,
      entryCount: acc.entryCount,
      share: ratio(acc.minutes, totalMinutes),
      rawValues: [...acc.raw.values()].sort(
        (a, b) => b.minutes - a.minutes || compareRaw(a.raw, b.raw),
      ),
      projects: [...acc.projects.entries()]
        .map(([name, minutes]) => ({
          name,
          minutes,
          share: minutes / acc.minutes,
        }))
        .sort(
          (a, b) =>
            b.minutes - a.minutes ||
            Number(a.name === NO_PROJECT) - Number(b.name === NO_PROJECT) ||
            a.name.localeCompare(b.name, "de"),
        ),
    };
  });

  const unknownShare = ratio(classMinutes.unknown, totalMinutes);

  return {
    period: describePeriod(period),
    depth,
    totals: {
      totalMinutes,
      billableMinutes: classMinutes.billable,
      nonBillableMinutes: classMinutes.nonBillable,
      unknownMinutes: classMinutes.unknown,
      bulkFillMinutes,
      entryCount,
      billableShare: billableShare(classMinutes.billable, totalMinutes),
      classifiedShare: ratio(
        classMinutes.billable,
        classMinutes.billable + classMinutes.nonBillable,
      ),
      unknownShare,
    },
    statuses,
    trend: months.map((month) => {
      const m = trendByMonth.get(month) ?? emptyClassMinutes();
      const total = m.billable + m.nonBillable + m.unknown;
      return {
        month,
        billableMinutes: m.billable,
        nonBillableMinutes: m.nonBillable,
        unknownMinutes: m.unknown,
        totalMinutes: total,
        billableShare: billableShare(m.billable, total),
      };
    }),
    showUnknownHint:
      unknownShare !== null && unknownShare >= UNKNOWN_SHARE_HINT_THRESHOLD,
  };
}

/** null zuerst, sonst alphabetisch. */
function compareRaw(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a.localeCompare(b, "de");
}

export interface ParsedBillingQuery {
  period: ReportPeriod;
  depth: number;
}

/**
 * Query der Route: period=month|quarter|year, key=2026-10|2026-Q4|2026,
 * depth=1–4. Fehlende Werte: laufender Monat, oberste Ebene.
 */
export function parseBillingQuery(
  params: URLSearchParams,
  todayKey: string = berlinTodayKey(),
):
  | { success: true; data: ParsedBillingQuery }
  | { success: false; error: string } {
  const kind = params.get("period") || "month";
  if (!isPeriodKind(kind)) {
    return {
      success: false,
      error: "Zeitraum muss month, quarter oder year sein",
    };
  }
  const key = params.get("key") || periodContaining(kind, todayKey).key;

  const rawDepth = params.get("depth");
  const depth = rawDepth ? Number(rawDepth) : 1;
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_PROJECT_DEPTH) {
    return {
      success: false,
      error: `Ebene muss zwischen 1 und ${MAX_PROJECT_DEPTH} liegen`,
    };
  }

  const period = parsePeriod(kind, key);
  if (!period) {
    const formats: Record<PeriodKind, string> = {
      month: "JJJJ-MM",
      quarter: "JJJJ-QN",
      year: "JJJJ",
    };
    return {
      success: false,
      error: `Zeitraum im Format ${formats[kind]} erwartet`,
    };
  }
  return { success: true, data: { period, depth } };
}
