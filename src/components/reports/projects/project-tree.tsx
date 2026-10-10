"use client";

import { ChevronRight } from "lucide-react";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import {
  defaultExpandedIds,
  formatShare,
  type ProjectNode,
  type ProjectTree as ProjectTreeData,
} from "@/lib/reports/projects";
import { cn } from "@/lib/utils";

interface VisibleRow {
  id: string;
  name: string;
  depth: number;
  minutes: number;
  share: number;
  expandable: boolean;
  expanded: boolean;
  /** Direkt auf den Elternknoten gebuchte Minuten */
  direct?: boolean;
  unassigned?: boolean;
}

const DIRECT_SUFFIX = "\u0000direct";

function collectExpandable(nodes: ProjectNode[], into: string[] = []) {
  for (const node of nodes) {
    if (node.children.length > 0) {
      into.push(node.id);
      collectExpandable(node.children, into);
    }
  }
  return into;
}

function visibleRows(
  nodes: ProjectNode[],
  expanded: Set<string>,
  total: number,
  rows: VisibleRow[] = [],
): VisibleRow[] {
  for (const node of nodes) {
    const expandable = node.children.length > 0;
    const isOpen = expandable && expanded.has(node.id);
    rows.push({
      id: node.id,
      name: node.name,
      depth: node.depth,
      minutes: node.totalMinutes,
      share: node.share,
      expandable,
      expanded: isOpen,
      unassigned: node.unassigned,
    });
    if (isOpen) {
      // Direkt gebuchte Minuten als eigene Zeile, damit die Kinder aufgehen
      if (node.ownMinutes > 0) {
        rows.push({
          id: `${node.id}${DIRECT_SUFFIX}`,
          name: "direkt gebucht",
          depth: node.depth + 1,
          minutes: node.ownMinutes,
          share: total > 0 ? node.ownMinutes / total : 0,
          expandable: false,
          expanded: false,
          direct: true,
        });
      }
      visibleRows(node.children, expanded, total, rows);
    }
  }
  return rows;
}

/** Aufklappbarer Projektbaum mit Stunden, Anteil am Gesamtvolumen und Balken. */
export function ProjectTree({ tree }: { tree: ProjectTreeData }) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedIds(tree)),
  );
  const expandable = useMemo(() => collectExpandable(tree.nodes), [tree]);
  const rows = useMemo(
    () => visibleRows(tree.nodes, expanded, tree.totalMinutes),
    [tree, expanded],
  );
  const allOpen =
    expandable.length > 0 && expandable.every((id) => expanded.has(id));

  const toggle = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-1.5 text-xs text-muted-foreground">
        <span>Projekt</span>
        <div className="flex items-center gap-2">
          {expandable.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 px-2 text-xs md:h-7"
              onClick={() =>
                setExpanded(allOpen ? new Set() : new Set(expandable))
              }
            >
              {allOpen ? "Alle zuklappen" : "Alle aufklappen"}
            </Button>
          ) : null}
          <span className="hidden w-16 text-right md:inline">Stunden</span>
          <span className="hidden w-14 text-right md:inline">Anteil</span>
        </div>
      </div>
      <ul className="divide-y">
        {rows.map((row) => (
          <TreeRow key={row.id} row={row} onToggle={toggle} />
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2 text-sm font-medium">
        <span>Gesamt</span>
        <span className="flex items-center gap-2">
          <span className="num w-16 text-right">
            {formatDuration(tree.totalMinutes)}
          </span>
          <span className="num w-14 text-right text-muted-foreground">
            100 %
          </span>
        </span>
      </div>
    </div>
  );
}

function TreeRow({
  row,
  onToggle,
}: {
  row: VisibleRow;
  onToggle: (id: string) => void;
}) {
  // Einrückung: mobil enger, damit tiefe Pfade lesbar bleiben
  const indent = { "--depth": row.depth } as CSSProperties;
  const label = (
    <span
      className={cn(
        "min-w-0 flex-1 truncate",
        row.depth === 0 && !row.direct && "font-medium",
        (row.direct || row.unassigned) && "text-muted-foreground",
        row.direct && "italic",
      )}
      title={row.name}
    >
      {row.name}
    </span>
  );

  return (
    <li
      className="px-4 py-2 pl-[calc(1rem+var(--depth)*0.75rem)] md:pl-[calc(1rem+var(--depth)*1.25rem)]"
      style={indent}
    >
      <div className="flex min-h-7 items-center gap-2 text-sm">
        {row.expandable ? (
          <button
            type="button"
            onClick={() => onToggle(row.id)}
            aria-expanded={row.expanded}
            className="-my-2 -ml-1.5 flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring md:min-h-7"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-[120ms]",
                row.expanded && "rotate-90",
              )}
            />
            {label}
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span aria-hidden="true" className="w-3 shrink-0 md:w-3.5" />
            {label}
          </span>
        )}
        <span className="num w-16 shrink-0 text-right">
          {formatDuration(row.minutes)}
        </span>
        <span className="num w-14 shrink-0 text-right text-muted-foreground">
          {formatShare(row.share)}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="mt-1 ml-5 h-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full",
            row.unassigned || row.direct
              ? "bg-muted-foreground/50"
              : "bg-chart-actual",
          )}
          style={{ width: `${Math.max(row.share * 100, 0.5)}%` }}
        />
      </div>
    </li>
  );
}
