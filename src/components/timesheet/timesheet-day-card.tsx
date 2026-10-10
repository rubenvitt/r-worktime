"use client";

import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDateShort } from "@/lib/format";
import { formatActivityLine } from "@/lib/timesheet/aggregate";
import { MAX_TEXT_LENGTH } from "@/lib/timesheet/extension-protocol";
import type { TimesheetDayView } from "@/lib/timesheet/types";
import { cn } from "@/lib/utils";

/** "2026-10-01" → "Do 01.10." */
export function formatDayLabel(dateKey: string): string {
  return formatDateShort(dateKey);
}

const TRAVEL_HINT =
  "Vorschlag aus Schlüsselwörtern im Titel und in den Notizen des Tages. Umschalten speichert eine Festlegung für diesen Tag – sie gilt auch im Bericht „Reisetage“.";

interface TimesheetDayCardProps {
  day: TimesheetDayView;
  /** effektiver Wert: Festlegung, sonst Vorschlag */
  travelFee: boolean;
  onTravelFeeChange: (value: boolean) => void;
  /** Festlegung entfernen, zurück auf den Vorschlag */
  onTravelFeeReset: () => void;
  onCopy: (text: string, label: string) => void;
  /** true, solange noch Daten der vorherigen Einstellung angezeigt werden */
  copyDisabled?: boolean;
}

/** Ein Tag des Stundenzettels als Zeile in der gemeinsamen Liste. */
export function TimesheetDayCard({
  day,
  travelFee,
  onTravelFeeChange,
  onTravelFeeReset,
  onCopy,
  copyDisabled = false,
}: TimesheetDayCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const switchId = `travel-${day.date}`;
  const detailsId = `day-details-${day.date}`;
  const dayLabel = formatDayLabel(day.date);
  const tooLong = day.text.length > MAX_TEXT_LENGTH;
  const textOpen = expanded || showFullText;
  const hasOverride = day.travelOverride !== null;

  // Erkennen, ob der Tagestext abgeschnitten ist (nur dann „Ganzen Text zeigen“)
  useEffect(() => {
    const element = textRef.current;
    if (!element || textOpen) return;
    const measure = () =>
      setClamped(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [textOpen]);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
      {/* Datum (klappt Details auf) */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="order-1 -ml-2 h-11 gap-2 px-2 md:h-8"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={`${dayLabel}: Details ${expanded ? "zuklappen" : "aufklappen"}`}
      >
        {expanded ? <ChevronDown /> : <ChevronRight />}
        <span className="num w-[9ch] text-left font-semibold">{dayLabel}</span>
      </Button>

      {/* Stunden (gerundet) */}
      <span className="num order-2 w-[6ch] text-right text-[15px] font-semibold">
        {day.hours}
      </span>

      {/* Kopieren: mobil in Zeile 1 rechts, Desktop ganz rechts */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="order-3 ml-auto size-11 md:order-5 md:ml-0 md:size-8"
        disabled={copyDisabled}
        onClick={() => onCopy(day.text, "Text")}
        aria-label={`Text vom ${dayLabel} kopieren`}
        title="Text kopieren"
      >
        <Copy />
      </Button>

      {/* Hinweise */}
      <div className="order-4 flex basis-full flex-wrap items-center gap-1.5 empty:hidden md:order-3 md:basis-auto">
        {day.criticalCount > 0 ? (
          <StatusBadge tone="warning">
            {`Ohne Notiz · ${day.criticalCount}`}
          </StatusBadge>
        ) : null}
        {day.hasIncompleteActivities ? (
          <StatusBadge tone="neutral">Teilweise ohne Notiz</StatusBadge>
        ) : null}
        {tooLong ? (
          <StatusBadge
            tone="warning"
            title={`Höchstens ${MAX_TEXT_LENGTH} Zeichen`}
          >
            {`${day.text.length} Zeichen`}
          </StatusBadge>
        ) : null}
      </div>

      {/* Dienstreise */}
      <div
        className="order-6 flex basis-full items-center gap-2 md:order-4 md:ml-auto md:basis-auto"
        title={TRAVEL_HINT}
      >
        <Switch
          id={switchId}
          checked={travelFee}
          onCheckedChange={onTravelFeeChange}
        />
        <Label
          htmlFor={switchId}
          className="min-h-11 text-[13px] font-normal md:min-h-0"
        >
          Dienstreise
          {hasOverride ? (
            <span className="text-muted-foreground">(festgelegt)</span>
          ) : day.travelFee ? (
            <span className="text-muted-foreground">(Vorschlag)</span>
          ) : null}
        </Label>
        {hasOverride && travelFee !== day.travelFee ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-11 px-0 text-[13px] text-muted-foreground md:h-auto"
            onClick={onTravelFeeReset}
            aria-label={`Dienstreise am ${dayLabel} auf den Vorschlag zurücksetzen`}
            title={
              day.travelFee
                ? "Vorschlag: Dienstreise"
                : "Vorschlag: keine Dienstreise"
            }
          >
            Vorschlag
          </Button>
        ) : null}
      </div>

      {/* Tagestext */}
      <div className="order-5 min-w-0 basis-full pl-0 md:order-6 md:pl-6">
        <p
          ref={textRef}
          className={cn(
            "whitespace-pre-wrap break-words text-[13px] leading-5 text-foreground/90",
            !textOpen && "line-clamp-3 max-h-[60px]",
          )}
        >
          {day.text || "—"}
        </p>
        {!textOpen && clamped ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-8 px-0 text-[13px]"
            onClick={() => setShowFullText(true)}
          >
            Ganzen Text zeigen
          </Button>
        ) : null}
        {tooLong ? (
          <p className="mt-1 text-xs text-warning">
            Der Text ist länger als {MAX_TEXT_LENGTH} Zeichen. Die Extension
            lehnt ihn so ab – kürze die Notizen in Timing.
          </p>
        ) : null}
      </div>

      {expanded ? (
        <div
          id={detailsId}
          className="order-7 min-w-0 basis-full space-y-3 pt-1 md:pl-6"
        >
          <ul className="divide-y rounded-md border">
            {day.activities.map((activity) => (
              <li
                key={activity.title}
                className="flex items-start gap-3 py-2 pr-1 pl-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-words text-[13px] font-medium">
                      {activity.title}
                    </span>
                    {activity.isCritical ? (
                      <StatusBadge tone="warning">Ohne Notiz</StatusBadge>
                    ) : null}
                    {activity.hasMissingEntries ? (
                      <StatusBadge tone="neutral">
                        Teilweise ohne Notiz
                      </StatusBadge>
                    ) : null}
                    {activity.isTitleWithParentheses &&
                    activity.notes.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        Braucht keine Notiz
                      </span>
                    ) : null}
                  </div>
                  {activity.notes.length > 0 ? (
                    <ul className="list-disc pl-5 text-[13px] text-muted-foreground">
                      {activity.notes.map((note) => (
                        <li key={note} className="break-words">
                          {note}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <span className="num pt-0.5 text-[13px]">{activity.hours}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 md:size-7"
                  aria-label={`„${activity.title}“ kopieren`}
                  disabled={copyDisabled}
                  onClick={() =>
                    onCopy(formatActivityLine(activity), "Aktivität")
                  }
                >
                  <Copy className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>

          {day.missingEntries.length > 0 ? (
            <div className="text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-x-3">
                <p className="font-medium">Einträge ohne Notiz</p>
                <Button
                  asChild
                  variant="link"
                  size="sm"
                  className="h-11 px-0 text-[13px] md:h-8"
                >
                  <Link
                    href={`/entries?dateFrom=${day.date}&dateTo=${day.date}`}
                  >
                    In Zeiteinträgen öffnen
                  </Link>
                </Button>
              </div>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {day.missingEntries.map((entry, index) => (
                  <li key={`${entry.activity}-${entry.start}-${index}`}>
                    <span className="num">
                      {entry.start}–{entry.end}
                    </span>{" "}
                    {entry.activity}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
