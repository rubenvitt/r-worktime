"use client";

import {
  CalendarCheck,
  ExternalLink,
  Loader2,
  Pencil,
  Puzzle,
  Trash2,
  X,
} from "lucide-react";
import { useId } from "react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  type DateSpan,
  type DraftSummary,
  MAX_DRAFT_NOTE_LENGTH,
} from "@/lib/vacation-planner";
import {
  DRAFT_STATUS_LABEL,
  DRAFT_STATUS_TONE,
  formatFreeDays,
  formatSpan,
  formatVacationDays,
} from "./planner-format";

export type SelectionState =
  | { mode: "idle" }
  | { mode: "anchor"; from: string }
  | {
      mode: "range";
      span: DateSpan;
      summary: DraftSummary;
      /** Zeitraum eines bestehenden Entwurfs wird ersetzt */
      editing: boolean;
      overlapsDraft: boolean;
    }
  | {
      mode: "draft";
      span: DateSpan;
      summary: DraftSummary;
      note: string | null;
    };

export interface SelectionPanelProps {
  state: SelectionState;
  /** Urlaubstage, die nach allen Entwürfen übrig bleiben */
  remainingAfter: number;
  note: string;
  onNoteChange: (note: string) => void;
  saving: boolean;
  deleting: boolean;
  extensionReady: boolean;
  onSave: () => void;
  onCancel: () => void;
  onRequest: () => void;
  onSendToExtension: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveNote: () => void;
  /** Kompakt in der Leiste am unteren Rand (mobil) */
  compact?: boolean;
}

function Facts({
  summary,
  remainingAfter,
  compact,
}: {
  summary: DraftSummary;
  remainingAfter?: number;
  compact?: boolean;
}) {
  return (
    <p className={cn("text-sm", compact && "text-[13px]")}>
      <span className="font-medium">{formatVacationDays(summary.open)}</span>
      {summary.booked > 0 ? (
        <span className="text-muted-foreground">
          {" "}
          (+{formatVacationDays(summary.booked)} gebucht)
        </span>
      ) : null}
      <span className="text-muted-foreground"> → </span>
      <span className="font-medium text-positive">
        {formatFreeDays(summary.stretchDays)}
      </span>
      {!compact ? (
        <span className="block text-[13px] text-muted-foreground">
          am Stück: {formatSpan(summary.stretch)}
          {remainingAfter !== undefined
            ? ` · danach ${formatVacationDays(remainingAfter).replace("kein Urlaubstag", "0 Urlaubstage")} übrig`
            : ""}
        </span>
      ) : null}
    </p>
  );
}

/** Auswahl, Vorschau und Aktionen für einen Zeitraum oder Entwurf. */
export function SelectionPanel({
  state,
  remainingAfter,
  note,
  onNoteChange,
  saving,
  deleting,
  extensionReady,
  onSave,
  onCancel,
  onRequest,
  onSendToExtension,
  onEdit,
  onDelete,
  onSaveNote,
  compact = false,
}: SelectionPanelProps) {
  const noteId = useId();

  if (state.mode === "idle") {
    return compact ? null : (
      <p className="text-[13px] text-muted-foreground">
        Klick auf den ersten und den letzten Tag – oder zieh mit der Maus über
        die Tage. Mit den Pfeiltasten wanderst du durch den Kalender, Esc bricht
        ab. Grüne Punkte markieren Brückentage.
      </p>
    );
  }

  if (state.mode === "anchor") {
    return (
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          Ab{" "}
          <span className="font-medium">
            {formatSpan({ from: state.from, to: state.from })}
          </span>{" "}
          – jetzt den letzten Tag wählen.
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    );
  }

  if (state.mode === "range") {
    return (
      <div className="w-full space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold">{formatSpan(state.span)}</p>
            <Facts
              summary={state.summary}
              remainingAfter={state.editing ? undefined : remainingAfter}
              compact={compact}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 md:size-8"
            onClick={onCancel}
            aria-label="Auswahl verwerfen"
          >
            <X />
          </Button>
        </div>
        {state.overlapsDraft && !state.editing ? (
          <p className="text-[13px] text-warning">
            Überschneidet sich mit einem Entwurf.
          </p>
        ) : null}
        {state.summary.status === "booked" && !state.editing ? (
          <p className="text-[13px] text-muted-foreground">
            Diese Tage sind schon gebucht.
          </p>
        ) : null}
        {!state.editing && !compact ? (
          <div className="space-y-1.5">
            <Label htmlFor={noteId}>Notiz (optional)</Label>
            <Input
              id={noteId}
              value={note}
              maxLength={MAX_DRAFT_NOTE_LENGTH}
              placeholder="z. B. Ostsee, mit Hund"
              onChange={(event) => onNoteChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSave();
              }}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="h-11 flex-1 sm:h-9 sm:flex-none"
          >
            {saving ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : null}
            {state.editing ? "Zeitraum übernehmen" : "Als Entwurf merken"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-11 sm:h-9"
          >
            Abbrechen
          </Button>
        </div>
      </div>
    );
  }

  const booked = state.summary.status === "booked";
  return (
    <div className="w-full space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{formatSpan(state.span)}</p>
            <StatusBadge tone={DRAFT_STATUS_TONE[state.summary.status]}>
              {DRAFT_STATUS_LABEL[state.summary.status]}
            </StatusBadge>
          </div>
          <Facts summary={state.summary} compact={compact} />
          {compact && state.note ? (
            <p className="truncate text-[13px] text-muted-foreground">
              {state.note}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 md:size-8"
          onClick={onCancel}
          aria-label="Schließen"
        >
          <X />
        </Button>
      </div>
      {!compact ? (
        <div className="space-y-1.5">
          <Label htmlFor={noteId}>Notiz</Label>
          <Input
            id={noteId}
            value={note}
            maxLength={MAX_DRAFT_NOTE_LENGTH}
            placeholder="z. B. Ostsee, mit Hund"
            onChange={(event) => onNoteChange(event.target.value)}
            onBlur={onSaveNote}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSaveNote();
            }}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!booked ? (
          extensionReady ? (
            <Button
              type="button"
              onClick={onSendToExtension}
              className="h-11 flex-1 sm:h-9 sm:flex-none"
            >
              <Puzzle aria-hidden="true" />
              An Extension senden
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onRequest}
              className="h-11 flex-1 sm:h-9 sm:flex-none"
              title="Kopiert den Zeitraum und öffnet Timewarp"
            >
              <ExternalLink aria-hidden="true" />
              In Timewarp beantragen
            </Button>
          )
        ) : (
          <p className="flex items-center gap-1.5 text-[13px] text-positive">
            <CalendarCheck className="size-4" aria-hidden="true" />
            Kommt aus Timewarp – nichts mehr zu tun.
          </p>
        )}
        {!booked && extensionReady ? (
          <Button
            type="button"
            variant="outline"
            onClick={onRequest}
            className="h-11 sm:h-9"
            title="Kopiert den Zeitraum und öffnet Timewarp"
          >
            <ExternalLink aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Timewarp</span>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={onEdit}
          className="h-11 sm:h-9"
          aria-label="Zeitraum ändern"
        >
          <Pencil aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Ändern</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDelete}
          disabled={deleting}
          className="h-11 text-destructive hover:text-destructive sm:h-9"
          aria-label={booked ? "Entwurf entfernen" : "Entwurf löschen"}
        >
          {deleting ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 aria-hidden="true" />
          )}
          <span className="sr-only sm:not-sr-only">
            {booked ? "Entfernen" : "Löschen"}
          </span>
        </Button>
      </div>
    </div>
  );
}
