// Beschriftungen für die Liste „Abwesenheiten {Jahr}“.

import type { Tone } from "@/components/app/status-badge";
import type {
  AbsenceBlock,
  AbsenceBlockSource,
  AbsenceBlockState,
} from "@/lib/absences/blocks";
import { KIND_LABELS } from "@/lib/absences/kinds";
import { formatDateShort } from "@/lib/format";
import { formatDays } from "./absence-style";

export const BLOCK_STATE_LABEL: Record<AbsenceBlockState, string> = {
  planned: "geplant",
  partial: "teils genommen",
  taken: "genommen",
  cancelled: "storniert",
};

export const BLOCK_STATE_TONE: Record<AbsenceBlockState, Tone> = {
  planned: "info",
  partial: "info",
  taken: "positive",
  cancelled: "neutral",
};

export const BLOCK_SOURCE_LABEL: Record<AbsenceBlockSource, string> = {
  TIMEWARP: "Timewarp",
  MANUAL: "manuell",
  TIMING: "Timing",
};

/**
 * Zeitraum eines Blocks: „Mo 12.10.2026“, „Mo 12.10. – Fr 16.10.2026“,
 * über den Jahreswechsel „Mo 28.12.2026 – Mo 04.01.2027“.
 */
export function formatBlockPeriod(from: string, to: string): string {
  const fromYear = from.slice(0, 4);
  const toYear = to.slice(0, 4);
  const end = `${formatDateShort(to)}${toYear}`;
  if (from === to) return end;
  const start =
    fromYear === toYear
      ? formatDateShort(from)
      : `${formatDateShort(from)}${fromYear}`;
  return `${start} – ${end}`;
}

/** Tage eines Blocks: „5 Tage“, „halber Tag“, „0 Tage“ */
export function formatBlockDays(block: AbsenceBlock): string {
  if (block.halfDay && block.days === 0.5) return "halber Tag";
  return formatDays(block.days);
}

/** Vollständige Beschreibung für Bestätigung und Screenreader */
export function describeBlock(block: AbsenceBlock): string {
  return `${KIND_LABELS[block.kind]} ${formatBlockPeriod(block.from, block.to)} (${formatBlockDays(block)})`;
}
