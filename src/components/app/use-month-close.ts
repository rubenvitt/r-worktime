"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { closeRange } from "@/components/app/month";
import { deriveSyncState } from "@/components/app/sync-state";
import {
  loadTimesheetPrefs,
  type TimesheetPrefs,
  timesheetQueryString,
} from "@/components/app/timesheet-prefs";
import { useProblems } from "@/components/app/use-problems";
import { useTrackingStart } from "@/components/app/use-tracking-start";
import { useTimingStatus } from "@/components/timing/use-timing";
import { berlinDateKey } from "@/lib/dates";
import { formatRelative } from "@/lib/format";
import type { TimesheetResponse } from "@/lib/timesheet/types";

export type StepStatus =
  | "done"
  | "attention"
  | "blocked"
  | "pending"
  | "loading";

export interface MonthCloseStep {
  key: "sync" | "problems" | "notes" | "transfer";
  title: string;
  status: StepStatus;
  summary: string;
  detail?: string;
  href?: string;
}

const clockFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function syncMoment(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (berlinDateKey(date) === berlinDateKey(now)) {
    return `heute, ${clockFormatter.format(date)}`;
  }
  return formatRelative(date, now);
}

/** Vier Schritte zum Monatsabschluss: Sync, Probleme, Notizen, Übertragen. */
export function useMonthClose(
  month: string,
  options?: { notesCriticalDays?: number },
): { steps: MonthCloseStep[]; doneCount: number; isLoading: boolean } {
  const notesGiven = options?.notesCriticalDays !== undefined;

  // Sync
  const status = useTimingStatus();
  const syncState = status.data ? deriveSyncState(status.data) : null;
  let sync: MonthCloseStep;
  if (status.isLoading) {
    sync = {
      key: "sync",
      title: "Sync",
      status: "loading",
      summary: "Wird geladen …",
    };
  } else if (status.isError || !syncState) {
    sync = {
      key: "sync",
      title: "Sync",
      status: "attention",
      summary: "Status nicht abrufbar",
      href: "/settings/timing",
    };
  } else {
    const last = status.data?.lastSyncAt ?? null;
    switch (syncState) {
      case "ok":
        sync = {
          key: "sync",
          title: "Sync",
          status: "done",
          summary: last ? `Aktuell · ${syncMoment(last)}` : "Aktuell",
        };
        break;
      case "failed":
        sync = {
          key: "sync",
          title: "Sync",
          status: "blocked",
          summary: "Fehlgeschlagen",
          detail: status.data?.lastSyncError ?? undefined,
        };
        break;
      case "stale":
        sync = {
          key: "sync",
          title: "Sync",
          status: "attention",
          summary: last ? `Veraltet · ${formatRelative(last)}` : "Veraltet",
        };
        break;
      case "never":
        sync = {
          key: "sync",
          title: "Sync",
          status: "attention",
          summary: "Noch nie synchronisiert",
        };
        break;
      case "running":
        sync = {
          key: "sync",
          title: "Sync",
          status: "loading",
          summary: "Synchronisiere …",
        };
        break;
      default:
        sync = {
          key: "sync",
          title: "Sync",
          status: "attention",
          summary: "Timing nicht verbunden",
          href: "/settings/timing",
        };
    }
  }

  // Probleme
  const tracking = useTrackingStart();
  const range = tracking.isLoading
    ? null
    : closeRange(month, tracking.trackingStart);
  const problems = useProblems(
    range
      ? {
          startDate: range.startDate,
          endDate: range.endDate,
          sortBy: "date_asc",
        }
      : null,
  );
  const problemsHref = `/problems?month=${month}`;
  let problemsStep: MonthCloseStep;
  if (tracking.isLoading || (range && problems.isLoading)) {
    problemsStep = {
      key: "problems",
      title: "Probleme",
      status: "loading",
      summary: "Wird geladen …",
      href: problemsHref,
    };
  } else if (range && problems.isError) {
    problemsStep = {
      key: "problems",
      title: "Probleme",
      status: "attention",
      summary: "Konnte nicht geladen werden",
      href: problemsHref,
    };
  } else {
    const total = range ? (problems.data?.stats.totalProblems ?? 0) : 0;
    problemsStep = {
      key: "problems",
      title: "Probleme",
      status: total === 0 ? "done" : "attention",
      summary:
        total === 0
          ? "Keine offenen Tage"
          : `${total} ${total === 1 ? "Tag" : "Tage"} offen`,
      href: problemsHref,
    };
  }

  // Notizen
  const [prefs, setPrefs] = useState<TimesheetPrefs | null>(null);
  useEffect(() => {
    if (!notesGiven) setPrefs(loadTimesheetPrefs());
  }, [notesGiven]);
  const timesheet = useQuery<TimesheetResponse>({
    queryKey: ["timesheet", "month-close", month, prefs],
    enabled: !notesGiven && prefs !== null,
    queryFn: async () => {
      if (!prefs) throw new Error("Keine Einstellungen");
      const response = await fetch(
        `/api/timesheet?${timesheetQueryString(month, prefs)}`,
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error ?? "Stundenzettel konnte nicht geladen werden",
        );
      }
      return body as TimesheetResponse;
    },
  });
  const notesHref = `/timesheet?month=${month}&filter=missing-notes`;
  let notes: MonthCloseStep;
  const critical = notesGiven
    ? (options?.notesCriticalDays ?? 0)
    : timesheet.data
      ? timesheet.data.days.filter((d) => d.criticalCount > 0).length
      : null;
  if (critical === null) {
    notes = timesheet.isError
      ? {
          key: "notes",
          title: "Notizen",
          status: "attention",
          summary: "Konnte nicht geladen werden",
          href: notesHref,
        }
      : {
          key: "notes",
          title: "Notizen",
          status: "loading",
          summary: "Wird geladen …",
          href: notesHref,
        };
  } else {
    notes = {
      key: "notes",
      title: "Notizen",
      status: critical === 0 ? "done" : "attention",
      summary:
        critical === 0
          ? "Alle Tage mit Notiz"
          : `${critical} ${critical === 1 ? "Tag" : "Tage"} ohne Notiz`,
      href: notesHref,
    };
  }

  // Übertragen
  const open = [sync, problemsStep, notes].filter((s) => s.status !== "done");
  const transfer: MonthCloseStep = {
    key: "transfer",
    title: "Übertragen",
    status: "pending",
    summary:
      open.length === 0
        ? "Bereit"
        : `Noch offen: ${open.map((s) => s.title).join(", ")}`,
    href: `/timesheet?month=${month}`,
  };

  const steps = [sync, problemsStep, notes, transfer];
  return {
    steps,
    doneCount: steps.filter((s) => s.status === "done").length,
    isLoading: steps.some((s) => s.status === "loading"),
  };
}
