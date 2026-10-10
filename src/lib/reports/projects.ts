// Projekt-Report: Stunden je Projekt als Baum, Verlauf der Top-Projekte, CSV.
// Rein, ohne Prisma – wird von API-Route und Oberfläche gemeinsam genutzt.
// Kalenderangaben immer in Europe/Berlin.

import { ADJUSTMENT_MARKER } from "@/lib/adjustment-marker";
import {
  berlinDateKey,
  berlinTodayKey,
  isDateKey,
  monthRange,
} from "@/lib/dates";
import {
  PROJECT_PATH_SEPARATOR,
  splitProjectPath,
} from "@/lib/timing/project-path";
import { buildCsv, csvHours } from "./csv";
import {
  type DescribedPeriod,
  describePeriod,
  periodBounds,
  type ReportPeriod,
  trendWindow,
} from "./period";

// ---------------------------------------------------------------------------
// Zeiträume (gemeinsam in ./period)

export function periodFileName(period: ReportPeriod): string {
  return `projekte-${period.key}.csv`;
}

// ---------------------------------------------------------------------------
// Einträge

/** Ausschnitt einer TimeEntry-Zeile, den der Report braucht. */
export interface ProjectSourceEntry {
  startTime: Date;
  endTime: Date;
  /** Stunden laut duration-Spalte (Fallback, wenn Start/Ende unbrauchbar sind) */
  duration?: number | null;
  type: string;
  source: string;
  projectPath: string | null;
  description?: string | null;
}

/** Nur Typ WORK zählt; OVERTIME ist ausschließlich die Saldo-Buchung. */
export const PROJECT_ENTRY_TYPES = ["WORK"] as const;
/** Saldo und Feiertagsimport sind keine Projektarbeit. */
export const EXCLUDED_PROJECT_SOURCES = ["ADJUSTMENT", "HOLIDAY"] as const;

export function isCountedProjectEntry(
  entry: Pick<ProjectSourceEntry, "type" | "source" | "description">,
): boolean {
  return (
    (PROJECT_ENTRY_TYPES as readonly string[]).includes(entry.type) &&
    !(EXCLUDED_PROJECT_SOURCES as readonly string[]).includes(entry.source) &&
    !(entry.description?.includes(ADJUSTMENT_MARKER) ?? false)
  );
}

/** Minuten aus Start/Ende (wie der Stundenzettel), sonst aus duration. */
export function entryMinutes(
  entry: Pick<ProjectSourceEntry, "startTime" | "endTime" | "duration">,
): number {
  const ms = entry.endTime.getTime() - entry.startTime.getTime();
  if (Number.isFinite(ms) && ms > 0) return Math.round(ms / 60_000);
  const hours = entry.duration;
  if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
    return Math.round(hours * 60);
  }
  return 0;
}

export interface ProjectRecord {
  /** Berliner Kalendertag des Starts */
  dayKey: string;
  monthKey: string;
  /** Leeres Array = ohne Projekt */
  segments: string[];
  minutes: number;
  /** Aus der Massen-Auffüllung (synthetisch, ohne Projekt) */
  bulkFill: boolean;
}

/** Filtert auf echte Arbeit und ordnet nach dem Berliner Tag des Starts zu. */
export function toProjectRecords(
  entries: ProjectSourceEntry[],
): ProjectRecord[] {
  const records: ProjectRecord[] = [];
  for (const entry of entries) {
    if (!isCountedProjectEntry(entry)) continue;
    if (Number.isNaN(entry.startTime.getTime())) continue;
    const minutes = entryMinutes(entry);
    if (minutes <= 0) continue;
    const dayKey = berlinDateKey(entry.startTime);
    records.push({
      dayKey,
      monthKey: dayKey.slice(0, 7),
      segments: entry.projectPath ? splitProjectPath(entry.projectPath) : [],
      minutes,
      bulkFill: entry.source === "BULK_FILL",
    });
  }
  return records;
}

/** Nur Einträge zwischen zwei Kalendertagen (inklusive). */
export function recordsInRange(
  records: ProjectRecord[],
  firstKey: string,
  lastKey: string,
): ProjectRecord[] {
  if (!isDateKey(firstKey) || !isDateKey(lastKey)) return [];
  return records.filter((r) => r.dayKey >= firstKey && r.dayKey <= lastKey);
}

export interface ProjectSummary {
  totalMinutes: number;
  entries: number;
  unassignedMinutes: number;
  bulkFillMinutes: number;
}

export function summarizeProjectEntries(
  records: ProjectRecord[],
): ProjectSummary {
  const summary: ProjectSummary = {
    totalMinutes: 0,
    entries: 0,
    unassignedMinutes: 0,
    bulkFillMinutes: 0,
  };
  for (const record of records) {
    summary.totalMinutes += record.minutes;
    summary.entries += 1;
    if (record.segments.length === 0) {
      summary.unassignedMinutes += record.minutes;
    }
    if (record.bulkFill) summary.bulkFillMinutes += record.minutes;
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Baum

/** Steuerzeichen-Präfix: kollidiert nie mit einem echten Projektnamen. */
export const UNASSIGNED_ID = "\u0000unassigned";
export const UNASSIGNED_LABEL = "Ohne Projekt";
export const OTHER_ID = "__other__";
export const OTHER_LABEL = "Übrige";

export interface ProjectNode {
  /** Voller Pfad mit " ▸ " bzw. UNASSIGNED_ID */
  id: string;
  name: string;
  path: string[];
  depth: number;
  /** Minuten inklusive aller Unterprojekte */
  totalMinutes: number;
  /** Direkt auf dieses Projekt gebuchte Minuten */
  ownMinutes: number;
  /** Anteil am Gesamtvolumen (0–1) */
  share: number;
  children: ProjectNode[];
  unassigned?: boolean;
}

export interface ProjectTree {
  totalMinutes: number;
  nodes: ProjectNode[];
}

interface MutableNode {
  name: string;
  path: string[];
  own: number;
  children: Map<string, MutableNode>;
}

function compareNodes(a: ProjectNode, b: ProjectNode): number {
  if (a.unassigned !== b.unassigned) return a.unassigned ? 1 : -1;
  if (b.totalMinutes !== a.totalMinutes) return b.totalMinutes - a.totalMinutes;
  return a.name.localeCompare(b.name, "de");
}

function freeze(node: MutableNode, total: number): ProjectNode {
  const children = [...node.children.values()]
    .map((child) => freeze(child, total))
    .filter((child) => child.totalMinutes > 0)
    .sort(compareNodes);
  const totalMinutes =
    node.own + children.reduce((sum, child) => sum + child.totalMinutes, 0);
  return {
    id: node.path.join(PROJECT_PATH_SEPARATOR),
    name: node.name,
    path: node.path,
    depth: node.path.length - 1,
    totalMinutes,
    ownMinutes: node.own,
    share: total > 0 ? totalMinutes / total : 0,
    children,
  };
}

export function buildProjectTree(
  items: Array<{ segments: string[]; minutes: number }>,
): ProjectTree {
  const roots = new Map<string, MutableNode>();
  let unassigned = 0;
  let total = 0;

  for (const item of items) {
    if (!(item.minutes > 0)) continue;
    total += item.minutes;
    if (item.segments.length === 0) {
      unassigned += item.minutes;
      continue;
    }
    let level = roots;
    let node: MutableNode | undefined;
    item.segments.forEach((segment, i) => {
      let next = level.get(segment);
      if (!next) {
        next = {
          name: segment,
          path: item.segments.slice(0, i + 1),
          own: 0,
          children: new Map(),
        };
        level.set(segment, next);
      }
      node = next;
      level = next.children;
    });
    if (node) node.own += item.minutes;
  }

  const nodes = [...roots.values()]
    .map((root) => freeze(root, total))
    .filter((node) => node.totalMinutes > 0);
  if (unassigned > 0) {
    nodes.push({
      id: UNASSIGNED_ID,
      name: UNASSIGNED_LABEL,
      path: [],
      depth: 0,
      totalMinutes: unassigned,
      ownMinutes: unassigned,
      share: total > 0 ? unassigned / total : 0,
      children: [],
      unassigned: true,
    });
  }
  nodes.sort(compareNodes);
  return { totalMinutes: total, nodes };
}

export interface FocusLevel {
  /** Pfad des Knotens, dessen Kinder die Fokusebene bilden ([] = oberste Ebene) */
  path: string[];
  /** Knoten der Fokusebene (ohne „Ohne Projekt“) */
  nodes: ProjectNode[];
}

/**
 * Erste Ebene mit mehr als einem Projekt: steigt durch Ketten mit genau
 * einem Kind ab (z. B. "Work ▸ Firma"). „Ohne Projekt“ zählt nicht mit.
 */
export function findFocusLevel(tree: ProjectTree): FocusLevel {
  let path: string[] = [];
  let nodes = tree.nodes.filter((node) => !node.unassigned);
  while (nodes.length === 1 && nodes[0].children.length > 0) {
    path = nodes[0].path;
    nodes = nodes[0].children;
  }
  return { path, nodes };
}

/** Beim Laden aufgeklappt: die Kette bis zur ersten Verzweigung. */
export function defaultExpandedIds(tree: ProjectTree): string[] {
  const { path } = findFocusLevel(tree);
  return path.map((_, i) => path.slice(0, i + 1).join(PROJECT_PATH_SEPARATOR));
}

// ---------------------------------------------------------------------------
// Verlauf

export type TrendSeriesKind = "project" | "other" | "unassigned";

export interface TrendSeries {
  id: string;
  label: string;
  kind: TrendSeriesKind;
  totalMinutes: number;
}

export interface TrendRow {
  month: string;
  total: number;
  values: Record<string, number>;
}

export interface ProjectTrend {
  months: string[];
  /** Pfad über der dargestellten Ebene ([] = oberste Ebene) */
  levelPath: string[];
  series: TrendSeries[];
  rows: TrendRow[];
}

export const DEFAULT_TREND_TOP = 5;

/**
 * Minuten je Monat für die größten Projekte der Fokusebene (über das ganze
 * Fenster). Kleinere Projekte und direkt auf höhere Ebenen Gebuchtes landen
 * in „Übrige“, Einträge ohne Projekt in einer eigenen Reihe.
 */
export function buildProjectTrend(
  records: ProjectRecord[],
  months: string[],
  topN = DEFAULT_TREND_TOP,
): ProjectTrend {
  const monthSet = new Set(months);
  const inWindow = records.filter((r) => monthSet.has(r.monthKey));
  const focus = findFocusLevel(buildProjectTree(inWindow));
  // Eine einzelne Restposition bekommt ihre eigene Reihe statt „Übrige“
  const top =
    focus.nodes.length <= topN + 1 ? focus.nodes : focus.nodes.slice(0, topN);
  const topNames = new Map(top.map((node) => [node.name, node.id]));
  const depth = focus.path.length;

  const seriesOf = (record: ProjectRecord): string => {
    if (record.segments.length === 0) return UNASSIGNED_ID;
    const inFocus =
      record.segments.length > depth &&
      focus.path.every((segment, i) => record.segments[i] === segment);
    if (!inFocus) return OTHER_ID;
    return topNames.get(record.segments[depth]) ?? OTHER_ID;
  };

  const ids = [...top.map((node) => node.id), OTHER_ID, UNASSIGNED_ID];
  const totals = new Map<string, number>(ids.map((id) => [id, 0]));
  const rows: TrendRow[] = months.map((month) => ({
    month,
    total: 0,
    values: Object.fromEntries(ids.map((id) => [id, 0])),
  }));
  const rowByMonth = new Map(rows.map((row) => [row.month, row]));

  for (const record of inWindow) {
    const id = seriesOf(record);
    const row = rowByMonth.get(record.monthKey);
    if (!row) continue;
    row.values[id] += record.minutes;
    row.total += record.minutes;
    totals.set(id, (totals.get(id) ?? 0) + record.minutes);
  }

  const series: TrendSeries[] = [
    ...top.map((node) => ({
      id: node.id,
      label: node.name,
      kind: "project" as const,
      totalMinutes: totals.get(node.id) ?? 0,
    })),
    {
      id: OTHER_ID,
      label: OTHER_LABEL,
      kind: "other" as const,
      totalMinutes: totals.get(OTHER_ID) ?? 0,
    },
    {
      id: UNASSIGNED_ID,
      label: UNASSIGNED_LABEL,
      kind: "unassigned" as const,
      totalMinutes: totals.get(UNASSIGNED_ID) ?? 0,
    },
  ].filter((s) => s.kind === "project" || s.totalMinutes > 0);

  // Leere Rest-Reihen auch aus den Zeilen entfernen
  const kept = new Set(series.map((s) => s.id));
  for (const row of rows) {
    for (const id of Object.keys(row.values)) {
      if (!kept.has(id)) delete row.values[id];
    }
  }

  return { months, levelPath: focus.path, series, rows };
}

// ---------------------------------------------------------------------------
// Formatierung und CSV

const shareFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** 0.4532 → "45,3 %", winzige Anteile → "< 0,1 %" */
export function formatShare(share: number): string {
  if (!(share > 0)) return "0 %";
  if (share < 0.0005) return "< 0,1 %";
  return `${shareFormatter.format(share * 100)} %`;
}

/**
 * Baum als CSV für Excel/Numbers (deutsch): Semikolon, Dezimalkomma, BOM.
 * Eine Zeile je Knoten in Baumreihenfolge mit summierten Stunden, dazu
 * eine Gesamtzeile. Die Stunden der Zeilen ergeben aufaddiert also nicht
 * die Gesamtsumme – nur die Zeilen der obersten Ebene tun das.
 */
export function projectTreeToCsv(tree: ProjectTree): string {
  const rows = [["Projektpfad", "Stunden", "Anteil"]];
  const visit = (node: ProjectNode) => {
    const path = node.unassigned
      ? UNASSIGNED_LABEL
      : node.path.join(PROJECT_PATH_SEPARATOR);
    rows.push([path, csvHours(node.totalMinutes), formatShare(node.share)]);
    node.children.forEach(visit);
  };
  tree.nodes.forEach(visit);
  rows.push([
    "Gesamt",
    csvHours(tree.totalMinutes),
    formatShare(tree.totalMinutes > 0 ? 1 : 0),
  ]);
  return buildCsv(rows);
}

// ---------------------------------------------------------------------------
// API-Vertrag

export interface ProjectsReportResponse {
  period: DescribedPeriod;
  summary: ProjectSummary;
  tree: ProjectTree;
  trend: ProjectTrend;
}

/** Baut die Antwort aus allen Einträgen, die Zeitraum und Verlaufsfenster abdecken. */
export function buildProjectsReport(
  entries: ProjectSourceEntry[],
  period: ReportPeriod,
  now: Date = new Date(),
): ProjectsReportResponse {
  const records = toProjectRecords(entries);
  const described = describePeriod(period);
  const inPeriod = recordsInRange(
    records,
    described.firstKey,
    described.lastKey,
  );
  return {
    period: described,
    summary: summarizeProjectEntries(inPeriod),
    tree: buildProjectTree(inPeriod),
    trend: buildProjectTrend(records, trendWindow(period, berlinTodayKey(now))),
  };
}

/** Kalendertage, die die Route laden muss (Zeitraum ∪ Verlaufsfenster). */
export function reportLoadRange(
  period: ReportPeriod,
  now: Date = new Date(),
): { firstKey: string; lastKey: string } {
  const bounds = periodBounds(period);
  const window = trendWindow(period, berlinTodayKey(now));
  const windowFirst = monthRange(window[0]).firstKey;
  const windowLast = monthRange(window[window.length - 1]).lastKey;
  return {
    firstKey: windowFirst < bounds.firstKey ? windowFirst : bounds.firstKey,
    lastKey: windowLast > bounds.lastKey ? windowLast : bounds.lastKey,
  };
}
