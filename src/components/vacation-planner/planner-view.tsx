"use client";

import { Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/app/error-state";
import { PageHeader } from "@/components/app/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/app/panel";
import { PeriodNav } from "@/components/app/period-nav";
import { SkeletonPanel, SkeletonStatStrip } from "@/components/app/skeletons";
import { Stat, StatStrip } from "@/components/app/stat-strip";
import { StatusBadge } from "@/components/app/status-badge";
import { StickyActionBar } from "@/components/app/sticky-action-bar";
import {
  formatDays,
  SETTINGS_VACATION_HREF,
} from "@/components/reports/absences/absence-style";
import { useReportYear } from "@/components/reports/use-report-params";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useOdooExtension } from "@/hooks/use-odoo-extension";
import { formatRelative, formatTimestamp } from "@/lib/format";
import { ackErrorMessage } from "@/lib/timesheet/extension-protocol";
import { cn } from "@/lib/utils";
import {
  type BridgeSuggestion,
  bridgeSuggestions,
  clipToYear,
  createPlannerContext,
  type DateSpan,
  type DraftSummary,
  daysOf,
  isPlannableDay,
  type PlannerContext,
  spanBetween,
  spansOverlap,
  summarizeDraft,
  type VacationDraftDto,
  type VacationPlannerResponse,
} from "@/lib/vacation-planner";
import { dayCellId, PlannerCalendar, PlannerLegend } from "./planner-calendar";
import {
  DRAFT_STATUS_LABEL,
  DRAFT_STATUS_TONE,
  formatFreeDays,
  formatSpan,
  formatSpanForCopy,
  formatVacationDays,
} from "./planner-format";
import { SelectionPanel, type SelectionState } from "./selection-panel";
import { useDraftMutations, useVacationPlanner } from "./use-vacation-planner";

interface DraftWithSummary extends VacationDraftDto {
  summary: DraftSummary;
  /** Offene Urlaubstage innerhalb des angezeigten Jahres */
  openInYear: number;
}

export function VacationPlannerView() {
  const { year, setYear, currentYear } = useReportYear({ maxOffset: 1 });
  const query = useVacationPlanner(year);
  const data = query.data && query.data.year === year ? query.data : undefined;

  return (
    <>
      <PageHeader
        title="Urlaubsplaner"
        description="Hier planst du, gebucht wird in Timewarp. Gebuchter Urlaub kommt über den Kalender-Abgleich zurück und hakt deine Entwürfe ab."
        period={
          <PeriodNav
            label={String(year)}
            onPrev={() => setYear(year - 1)}
            onNext={() => setYear(year + 1)}
            onToday={() => setYear(currentYear)}
            isCurrent={year === currentYear}
            prevDisabled={year <= currentYear - 1}
            nextDisabled={year >= currentYear + 1}
            prevLabel="Vorjahr"
            nextLabel="Nächstes Jahr"
            todayLabel="Dieses Jahr"
          />
        }
      />

      {query.isPending || (!data && query.isFetching) ? (
        <div className="space-y-6" aria-busy="true">
          <SkeletonStatStrip tiles={4} />
          <SkeletonPanel lines={10} />
        </div>
      ) : query.isError && !data ? (
        <ErrorState
          title="Der Urlaubsplaner konnte nicht geladen werden"
          error={query.error}
          onRetry={() => query.refetch()}
        />
      ) : data ? (
        // Neu mounten je Jahr: Auswahl gehört zum Jahr
        <div className="space-y-6">
          <PlannerContent key={data.year} data={data} />
        </div>
      ) : null}
    </>
  );
}

function PlannerContent({ data }: { data: VacationPlannerResponse }) {
  const { year, todayKey } = data;
  const mutations = useDraftMutations();
  const extension = useOdooExtension();

  const ctx: PlannerContext = useMemo(
    () =>
      createPlannerContext({
        workDays: data.workDays,
        holidays: data.holidays,
        booked: data.booked,
      }),
    [data],
  );

  const drafts: DraftWithSummary[] = useMemo(
    () =>
      data.drafts.map((draft) => {
        const summary = summarizeDraft(draft, ctx);
        const inYear = clipToYear(draft, year);
        return {
          ...draft,
          summary,
          openInYear:
            inYear && summary.status !== "booked"
              ? summarizeDraft(inYear, ctx).open
              : 0,
        };
      }),
    [data.drafts, ctx, year],
  );

  const draftByDay = useMemo(() => {
    const map = new Map<string, string>();
    for (const draft of drafts) {
      for (const key of daysOf(draft)) {
        if (!map.has(key)) map.set(key, draft.id);
      }
    }
    return map;
  }, [drafts]);

  const suggestions = useMemo(
    () => bridgeSuggestions(year, todayKey, ctx),
    [year, todayKey, ctx],
  );
  const bridgeDays = useMemo(() => {
    const keys = new Set<string>();
    for (const suggestion of suggestions) {
      for (const key of daysOf(suggestion)) {
        if (isPlannableDay(key, ctx) && !draftByDay.has(key)) keys.add(key);
      }
    }
    return keys;
  }, [suggestions, ctx, draftByDay]);

  // Auswahl: Anker (erster Klick), Mauszeiger, fertiger Zeitraum
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [committed, setCommitted] = useState<DateSpan | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<DateSpan | null>(null);
  const [note, setNote] = useState("");
  const [focusKey, setFocusKey] = useState(() =>
    todayKey.slice(0, 4) === String(year) ? todayKey : `${year}-01-01`,
  );

  const selectedDraft = drafts.find((d) => d.id === selectedDraftId) ?? null;
  const preview: DateSpan | null =
    committed ?? (anchor ? spanBetween(anchor, hover ?? anchor) : null);

  const draftOpenDays = drafts.reduce((sum, d) => sum + d.openInYear, 0);
  const account = data.account;
  const remaining =
    account.entitlement - account.taken - account.booked - draftOpenDays;

  const reset = useCallback(() => {
    setAnchor(null);
    setHover(null);
    setCommitted(null);
    setSelectedDraftId(null);
    setEditingDraftId(null);
    setNote("");
  }, []);

  const selectDraft = (draft: VacationDraftDto) => {
    setAnchor(null);
    setCommitted(null);
    setEditingDraftId(null);
    setSelectedDraftId(draft.id);
    setNote(draft.note ?? "");
  };

  const handleDayClick = (key: string) => {
    if (anchor) {
      setCommitted(spanBetween(anchor, key));
      setAnchor(null);
      return;
    }
    const draftId = draftByDay.get(key);
    if (draftId && !editingDraftId) {
      const draft = drafts.find((d) => d.id === draftId);
      if (draft) selectDraft(draft);
      return;
    }
    setAnchor(key);
    setHover(key);
    setCommitted(null);
    if (!editingDraftId) {
      setSelectedDraftId(null);
      setNote("");
    }
  };

  const selectSpan = (span: DateSpan) => {
    setAnchor(null);
    setCommitted(span);
    if (!editingDraftId) {
      setSelectedDraftId(null);
      setNote("");
    }
  };

  let state: SelectionState = { mode: "idle" };
  if (anchor) {
    state = { mode: "anchor", from: anchor };
  } else if (committed) {
    state = {
      mode: "range",
      span: committed,
      summary: summarizeDraft(committed, ctx),
      editing: editingDraftId !== null,
      overlapsDraft: drafts.some(
        (d) => d.id !== editingDraftId && spansOverlap(d, committed),
      ),
    };
  } else if (selectedDraft) {
    state = {
      mode: "draft",
      span: selectedDraft,
      summary: selectedDraft.summary,
      note: selectedDraft.note,
    };
  }

  const remainingAfter =
    state.mode === "range"
      ? remaining -
        (clipToYear(state.span, year)
          ? summarizeDraft(clipToYear(state.span, year) as DateSpan, ctx).open
          : 0)
      : remaining;

  const handleSave = () => {
    if (!committed) return;
    if (editingDraftId) {
      mutations.update.mutate(
        { id: editingDraftId, from: committed.from, to: committed.to },
        {
          onSuccess: (draft) => {
            toast.success(`Entwurf auf ${formatSpan(draft)} geändert`);
            setCommitted(null);
            setEditingDraftId(null);
            setSelectedDraftId(draft.id);
            setNote(draft.note ?? "");
          },
          onError: (error) => toast.error(error.message),
        },
      );
      return;
    }
    mutations.create.mutate(
      { from: committed.from, to: committed.to, note: note.trim() || null },
      {
        onSuccess: (draft) => {
          toast.success(`Entwurf ${formatSpan(draft)} gemerkt`);
          setCommitted(null);
          setSelectedDraftId(draft.id);
          setNote(draft.note ?? "");
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const handleSaveNote = () => {
    if (!selectedDraft) return;
    const next = note.trim() || null;
    if (next === selectedDraft.note) return;
    mutations.update.mutate(
      { id: selectedDraft.id, note: next },
      {
        onSuccess: () => toast.success("Notiz gespeichert"),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const handleDelete = () => {
    if (!selectedDraft) return;
    const label = formatSpan(selectedDraft);
    mutations.remove.mutate(selectedDraft.id, {
      onSuccess: () => {
        toast.success(`Entwurf ${label} gelöscht`);
        reset();
      },
      onError: (error) => toast.error(error.message),
    });
  };

  const handleRequest = async () => {
    if (!selectedDraft) return;
    const text = formatSpanForCopy(selectedDraft);
    // Fenster zuerst öffnen, sonst blockt der Browser das Pop-up nach await
    window.open(data.timewarpUrl, "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Zeitraum ${text} kopiert – in Timewarp einfügen`);
    } catch {
      toast.message(`Zeitraum in Timewarp eintragen: ${text}`);
    }
  };

  const handleSendToExtension = async () => {
    if (!selectedDraft) return;
    const result = await extension.sendAbsence({
      draftId: selectedDraft.id,
      kind: "URLAUB",
      from: selectedDraft.from,
      to: selectedDraft.to,
      halfDay: false,
      workDays: selectedDraft.summary.open,
      note: selectedDraft.note,
      generatedAt: new Date().toISOString(),
    });
    if (result.ok) {
      toast.success("An die Extension gesendet – jetzt Timewarp öffnen");
      window.open(data.timewarpUrl, "_blank", "noopener,noreferrer");
    } else {
      toast.error(ackErrorMessage(result.error));
    }
  };

  const panelProps = {
    state,
    remainingAfter,
    note,
    onNoteChange: setNote,
    saving: mutations.create.isPending || mutations.update.isPending,
    deleting: mutations.remove.isPending,
    extensionReady: extension.supportsAbsence,
    onSave: handleSave,
    onCancel: reset,
    onRequest: handleRequest,
    onSendToExtension: handleSendToExtension,
    onEdit: () => {
      if (!selectedDraft) return;
      setEditingDraftId(selectedDraft.id);
      setCommitted(null);
      setAnchor(null);
      toast.message("Wähl den neuen Zeitraum im Kalender");
    },
    onDelete: handleDelete,
    onSaveNote: handleSaveNote,
  };

  const focusDay = (key: string) => {
    setFocusKey(key);
    document
      .getElementById(dayCellId(key))
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <>
      <section aria-label="Urlaubskonto">
        <StatStrip>
          <Stat
            label="Übrig nach Plan"
            value={formatDays(remaining)}
            tone={remaining < 0 ? "negative" : "neutral"}
            emphasis
            hint={
              remaining < 0
                ? "Mehr geplant als Anspruch"
                : draftOpenDays > 0
                  ? "nach gebuchtem Urlaub und Entwürfen"
                  : "nach gebuchtem Urlaub"
            }
          />
          <Stat
            label="Anspruch"
            value={formatDays(account.entitlement)}
            hint="In den Einstellungen ändern"
            href={SETTINGS_VACATION_HREF}
          />
          <Stat
            label="Genommen und gebucht"
            value={formatDays(account.taken + account.booked)}
            hint={
              account.booked > 0
                ? `davon ${formatDays(account.booked)} noch vor dir`
                : "bis heute"
            }
          />
          <Stat
            label="In Entwürfen"
            value={formatDays(draftOpenDays)}
            hint={
              drafts.length > 0
                ? `${drafts.length} ${drafts.length === 1 ? "Entwurf" : "Entwürfe"}`
                : "noch nichts geplant"
            }
          />
        </StatStrip>
      </section>

      <SyncHint data={data} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel aria-labelledby="planner-calendar-title">
          <PanelHeader
            title={<span id="planner-calendar-title">Kalender {year}</span>}
          />
          <PanelBody className="space-y-5">
            <PlannerCalendar
              year={year}
              todayKey={todayKey}
              ctx={ctx}
              draftByDay={draftByDay}
              bridgeDays={bridgeDays}
              selection={preview}
              highlight={highlight}
              selectedDraftId={selectedDraftId}
              focusKey={focusKey}
              onFocusKey={setFocusKey}
              onDayClick={handleDayClick}
              onDayHover={(key) => {
                if (anchor) setHover(key);
              }}
              onDragSelect={(span) => {
                setAnchor(null);
                setCommitted(span);
                if (!editingDraftId) setSelectedDraftId(null);
              }}
              onEscape={reset}
            />
            <PlannerLegend />
          </PanelBody>
        </Panel>

        <div className="space-y-6">
          <Panel
            aria-labelledby="planner-selection-title"
            className="hidden lg:sticky lg:top-6 lg:z-10 lg:block"
          >
            <PanelHeader
              title={
                <span id="planner-selection-title">
                  {editingDraftId ? "Zeitraum ändern" : "Auswahl"}
                </span>
              }
            />
            <PanelBody>
              <SelectionPanel {...panelProps} />
            </PanelBody>
          </Panel>

          <BridgePanel
            year={year}
            suggestions={suggestions}
            drafts={drafts}
            onPick={(suggestion) => {
              selectSpan({ from: suggestion.from, to: suggestion.to });
              focusDay(suggestion.from);
            }}
            onHighlight={setHighlight}
          />

          <DraftsPanel
            drafts={drafts}
            selectedDraftId={selectedDraftId}
            onPick={(draft) => {
              selectDraft(draft);
              focusDay(draft.from);
            }}
          />
        </div>
      </div>

      <StickyActionBar open={state.mode !== "idle"} className="lg:hidden">
        <SelectionPanel {...panelProps} compact />
      </StickyActionBar>
    </>
  );
}

function SyncHint({ data }: { data: VacationPlannerResponse }) {
  if (data.holidayServiceUnavailable) {
    return (
      <Alert variant="warning">
        <TriangleAlert />
        <AlertDescription>
          Der Feiertags-Dienst ist gerade nicht erreichbar. Angezeigt werden nur
          importierte Feiertage, Brückentage können fehlen.
        </AlertDescription>
      </Alert>
    );
  }
  if (!data.calendarConfigured) {
    return (
      <Alert variant="info">
        <Info />
        <AlertDescription>
          <p>
            Ohne Timewarp-Feed sieht der Planer nur Urlaub, den du hier oder in
            Timing eingetragen hast, und kann Entwürfe nicht abhaken.{" "}
            <Link
              href="/settings/calendar"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Kalender verbinden
            </Link>
          </p>
        </AlertDescription>
      </Alert>
    );
  }
  return data.calendarLastSyncAt ? (
    <p className="text-[13px] text-muted-foreground">
      Gebuchtes aus Timewarp, zuletzt abgeglichen{" "}
      <time
        dateTime={data.calendarLastSyncAt}
        title={formatTimestamp(data.calendarLastSyncAt)}
        className="num text-foreground"
      >
        {formatRelative(data.calendarLastSyncAt)}
      </time>
      .{" "}
      <Link
        href="/settings/calendar"
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        Jetzt abgleichen
      </Link>
    </p>
  ) : null;
}

function BridgePanel({
  year,
  suggestions,
  drafts,
  onPick,
  onHighlight,
}: {
  year: number;
  suggestions: BridgeSuggestion[];
  drafts: DraftWithSummary[];
  onPick: (suggestion: BridgeSuggestion) => void;
  onHighlight: (span: DateSpan | null) => void;
}) {
  return (
    <Panel aria-labelledby="planner-bridges-title">
      <PanelHeader
        title={<span id="planner-bridges-title">Brückentage {year}</span>}
      />
      <PanelBody flush>
        {suggestions.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">
            Keine Brückentage mehr in diesem Jahr.
          </p>
        ) : (
          <ul className="divide-y">
            {suggestions.map((suggestion) => {
              const planned = drafts.some((d) => spansOverlap(d, suggestion));
              return (
                <li key={`${suggestion.from}-${suggestion.to}`}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    onClick={() => onPick(suggestion)}
                    onPointerEnter={() => onHighlight(suggestion.stretch)}
                    onPointerLeave={() => onHighlight(null)}
                    onFocus={() => onHighlight(suggestion.stretch)}
                    onBlur={() => onHighlight(null)}
                  >
                    <span className="min-w-0 space-y-0.5">
                      <span className="block text-sm font-medium">
                        {formatSpan(suggestion)}
                      </span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {suggestion.holidayNames.join(", ")} ·{" "}
                        {formatSpan(suggestion.stretch)}
                      </span>
                    </span>
                    <span className="shrink-0 space-y-0.5 text-right">
                      <span className="num block text-[13px]">
                        {formatVacationDays(suggestion.cost)}
                      </span>
                      <span className="num block text-[13px] font-medium text-positive">
                        {formatFreeDays(suggestion.stretchDays)}
                      </span>
                      {planned ? (
                        <span className="block text-[11px] text-muted-foreground">
                          eingeplant
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}

function DraftsPanel({
  drafts,
  selectedDraftId,
  onPick,
}: {
  drafts: DraftWithSummary[];
  selectedDraftId: string | null;
  onPick: (draft: DraftWithSummary) => void;
}) {
  return (
    <Panel aria-labelledby="planner-drafts-title">
      <PanelHeader title={<span id="planner-drafts-title">Entwürfe</span>} />
      <PanelBody flush>
        {drafts.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-muted-foreground">
            Noch keine Entwürfe. Wähl Tage im Kalender oder einen Brückentag.
          </p>
        ) : (
          <ul className="divide-y">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <button
                  type="button"
                  aria-pressed={draft.id === selectedDraftId}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                    draft.id === selectedDraftId && "bg-accent",
                  )}
                  onClick={() => onPick(draft)}
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className="block text-sm font-medium">
                      {formatSpan(draft)}
                    </span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {draft.note ??
                        `${formatVacationDays(draft.summary.open)} → ${formatFreeDays(draft.summary.stretchDays)}`}
                    </span>
                  </span>
                  <StatusBadge tone={DRAFT_STATUS_TONE[draft.summary.status]}>
                    {DRAFT_STATUS_LABEL[draft.summary.status]}
                  </StatusBadge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
