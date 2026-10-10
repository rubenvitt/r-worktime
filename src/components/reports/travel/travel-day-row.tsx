"use client";

import { Check, Loader2, RotateCcw, X } from "lucide-react";
import { StatusBadge, type Tone } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateShort, formatDuration } from "@/lib/format";
import {
  TRAVEL_STATUS_LABELS,
  type TravelReportRow,
  type TravelStatus,
} from "@/lib/reports/travel";

const STATUS_TONE: Record<TravelStatus, Tone> = {
  suggested: "info",
  confirmed: "positive",
  added: "neutral",
  rejected: "neutral",
  none: "neutral",
};

const STATUS_HINT: Partial<Record<TravelStatus, string>> = {
  suggested: "Aus Schlüsselwörtern erkannt, noch nicht bestätigt",
  confirmed: "Vorschlag bestätigt",
  added: "Ohne Vorschlag als Reisetag festgelegt",
  rejected: "Vorschlag abgelehnt",
};

/** Ein Tag im Reisetage-Bericht mit Aktionen je nach Status. */
export function TravelDayRow({
  row,
  pending,
  onDecide,
}: {
  row: TravelReportRow;
  pending: boolean;
  /** true/false = festlegen, null = Festlegung entfernen */
  onDecide: (isTravel: boolean | null) => void;
}) {
  const dayLabel = formatDateShort(row.date);
  const activities = row.activities.slice(0, 3).join(" · ");
  const moreActivities = row.activities.length - 3;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
      <span className="num w-[9ch] shrink-0 text-[13px] font-semibold">
        {dayLabel}
      </span>

      <div className="order-last min-w-0 basis-full md:order-none md:flex-1 md:basis-auto">
        <p className="truncate text-[13px]" title={row.activities.join(" · ")}>
          {activities || (
            <span className="text-muted-foreground">Keine Einträge</span>
          )}
          {moreActivities > 0 ? (
            <span className="text-muted-foreground">{` +${moreActivities}`}</span>
          ) : null}
        </p>
        {row.projects.length > 0 ? (
          <p
            className="truncate text-xs text-muted-foreground"
            title={row.projects.join(" | ")}
          >
            {row.projects.join(" | ")}
          </p>
        ) : null}
      </div>

      <span className="num w-[6ch] text-right text-[13px] font-semibold">
        {formatDuration(row.minutes)}
      </span>

      <span title={STATUS_HINT[row.status]}>
        <StatusBadge tone={STATUS_TONE[row.status]}>
          {TRAVEL_STATUS_LABELS[row.status]}
        </StatusBadge>
      </span>

      <div className="ml-auto flex items-center gap-1">
        {pending ? (
          <Loader2
            className="size-4 animate-spin text-muted-foreground"
            aria-label="Wird gespeichert"
          />
        ) : null}
        {row.status === "suggested" ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 md:h-8"
              disabled={pending}
              onClick={() => onDecide(true)}
              aria-label={`Reisetag am ${dayLabel} bestätigen`}
            >
              <Check />
              Bestätigen
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 md:h-8"
              disabled={pending}
              onClick={() => onDecide(false)}
              aria-label={`Vorschlag am ${dayLabel} ablehnen`}
            >
              <X />
              Ablehnen
            </Button>
          </>
        ) : row.status === "confirmed" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 md:h-8"
            disabled={pending}
            onClick={() => onDecide(false)}
            aria-label={`Reisetag am ${dayLabel} ablehnen`}
          >
            <X />
            Ablehnen
          </Button>
        ) : row.status === "added" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 md:h-8"
            disabled={pending}
            onClick={() => onDecide(null)}
            aria-label={`Reisetag am ${dayLabel} entfernen`}
          >
            <X />
            Entfernen
          </Button>
        ) : row.status === "rejected" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 md:h-8"
            disabled={pending}
            onClick={() => onDecide(null)}
            aria-label={`Vorschlag am ${dayLabel} wiederherstellen`}
          >
            <RotateCcw />
            Wiederherstellen
          </Button>
        ) : null}
      </div>
    </li>
  );
}
