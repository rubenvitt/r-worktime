// Beschriftungen für den Urlaubsplaner. Rein, ohne React.

import { formatDateShort, formatDecimal } from "@/lib/format";
import type { DateSpan, DraftStatus } from "@/lib/vacation-planner";

/** "Fr 07.05." bzw. "Mo 03.05. – Fr 07.05."; über den Jahreswechsel mit Jahr */
export function formatSpan(span: DateSpan): string {
  if (span.from === span.to) return formatDateShort(span.from);
  if (span.from.slice(0, 4) !== span.to.slice(0, 4)) {
    return `${formatDateShort(span.from)}${span.from.slice(0, 4)} – ${formatDateShort(span.to)}${span.to.slice(0, 4)}`;
  }
  return `${formatDateShort(span.from)} – ${formatDateShort(span.to)}`;
}

/** "03.05.2027 – 07.05.2027" zum Einfügen in Timewarp */
export function formatSpanForCopy(span: DateSpan): string {
  const day = (key: string) =>
    `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}`;
  return span.from === span.to
    ? day(span.from)
    : `${day(span.from)} – ${day(span.to)}`;
}

/** 1 → "1 Urlaubstag", 2,5 → "2,5 Urlaubstage", 0 → "kein Urlaubstag" */
export function formatVacationDays(days: number): string {
  if (days === 0) return "kein Urlaubstag";
  return `${formatDecimal(days, 1)} ${days === 1 ? "Urlaubstag" : "Urlaubstage"}`;
}

/** 4 → "4 Tage frei" */
export function formatFreeDays(days: number): string {
  return `${days} ${days === 1 ? "Tag" : "Tage"} frei`;
}

export const DRAFT_STATUS_LABEL: Record<DraftStatus, string> = {
  open: "Entwurf",
  partial: "Teilweise gebucht",
  booked: "In Timewarp gebucht",
};

export const DRAFT_STATUS_TONE = {
  open: "info",
  partial: "warning",
  booked: "positive",
} as const satisfies Record<DraftStatus, string>;
