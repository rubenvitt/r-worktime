"use client";

import { Loader2, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import type { AbsenceBlock } from "@/lib/absences/blocks";
import { KIND_LABELS } from "@/lib/absences/kinds";
import { cn } from "@/lib/utils";
import {
  BLOCK_SOURCE_LABEL,
  BLOCK_STATE_LABEL,
  BLOCK_STATE_TONE,
  describeBlock,
  formatBlockDays,
  formatBlockPeriod,
} from "./absence-blocks-format";

export function blockKey(block: AbsenceBlock): string {
  return block.id ?? `${block.source}-${block.kind}-${block.from}`;
}

/** Blöcke als gestapelte Zeilen; auf dem Handy zwei Zeilen je Block. */
export function AbsenceBlocksList({
  blocks,
  onRequestDelete,
  deletingId,
}: {
  blocks: AbsenceBlock[];
  onRequestDelete?: (block: AbsenceBlock) => void;
  /** Block, der gerade gelöscht wird */
  deletingId?: string | null;
}) {
  return (
    <ul className="divide-y">
      {blocks.map((block) => {
        const cancelled = block.state === "cancelled";
        const deleting = deletingId != null && deletingId === block.id;
        return (
          <li
            key={blockKey(block)}
            className="flex min-h-14 items-center gap-3 px-4 py-2"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span
                  className={cn(
                    "num text-sm font-medium",
                    cancelled && "text-muted-foreground line-through",
                  )}
                >
                  {formatBlockPeriod(block.from, block.to)}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    cancelled && "text-muted-foreground line-through",
                  )}
                >
                  {KIND_LABELS[block.kind]}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "num mr-1 text-[13px] text-muted-foreground",
                    cancelled && "line-through",
                  )}
                >
                  {formatBlockDays(block)}
                </span>
                <StatusBadge tone={BLOCK_STATE_TONE[block.state]}>
                  {BLOCK_STATE_LABEL[block.state]}
                </StatusBadge>
                <StatusBadge
                  tone="neutral"
                  title={
                    block.source === "TIMING"
                      ? "Urlaubseinträge aus Timing ohne verknüpfte Abwesenheit"
                      : undefined
                  }
                >
                  {BLOCK_SOURCE_LABEL[block.source]}
                </StatusBadge>
              </div>
            </div>
            {block.deletable && block.id && onRequestDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 text-muted-foreground hover:text-destructive sm:size-8"
                onClick={() => onRequestDelete(block)}
                disabled={deleting}
                aria-label={`${describeBlock(block)} löschen`}
              >
                {deleting ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 aria-hidden="true" />
                )}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
