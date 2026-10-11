// Kalender-Abgleich: Timewarp-Feed → Abwesenheiten → Tage → Timing → Protokoll.
// Regeln: docs/superpowers/specs/2026-10-11-timewarp-absences-design.md, „Abgleich“.
//
// Ein Lauf hält die Abwesenheits-Sperre des Nutzers (dieselbe wie Dialog und
// DELETE /api/absences/[id]) für die ganze Transaktion, also auch während der
// Timing-Aufrufe. Timing-Fehler je Tag werden abgefangen (Aktion „failed“,
// der nächste Lauf sucht erst in Timing und legt dann an → keine Duplikate).
// DB-Fehler brechen den Lauf ab; Postgres verwirft dann die ganze Transaktion.

import {
  AbsenceSource,
  AbsenceStatus,
  EntrySource,
  EntryType,
  type Prisma,
} from "@prisma/client";
import {
  type AbsenceKind,
  KIND_LABELS,
  writesToTiming,
} from "@/lib/absences/kinds";
import { withUserAbsenceLock } from "@/lib/absences/lock";
import { CalendarFeedError, fetchCalendarFeed } from "@/lib/calendar/feed";
import {
  type AbsencePlan,
  planAbsences,
  type StoredAbsence,
} from "@/lib/calendar/plan-absences";
import {
  type DayPlan,
  type DayPlanAbsence,
  isHalfDayEntry,
  type PlannedCreate,
  planDays,
} from "@/lib/calendar/plan-days";
import {
  parseTimewarpFeed,
  summarizeFeed,
  type TimewarpFeedResult,
  TimewarpParseError,
} from "@/lib/calendar/timewarp";
import {
  CALENDAR_SYNC_LOG_KEEP,
  CALENDAR_SYNC_STATUS_ERROR,
  CALENDAR_SYNC_STATUS_SUCCESS,
  type CalendarSyncAction,
  type CalendarSyncResult,
  type CalendarSyncStats,
} from "@/lib/calendar/types";
import { decryptSecret } from "@/lib/crypto";
import {
  berlinDateKey,
  berlinDayStart,
  berlinTodayKey,
  dateKeyFromDbDate,
  yearsOfRange,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { dailyTargetHours } from "@/lib/reports/absences";
import {
  createTimingClient,
  type TimingApiTimeEntry,
  type TimingClient,
} from "@/lib/timing/client";
import { joinTitleChain } from "@/lib/timing/project-path";
import { loadOfficialHolidays } from "@/services/holiday.service";
import { overtimeService } from "@/services/overtime.service";
import { getUserSettings } from "@/services/settings.service";

/** Notiz an Einträgen, die der Abgleich anlegt */
export const TIMEWARP_NOTE = "Aus Timewarp";

const TRANSACTION_TIMEOUT_MS = 5 * 60_000;
const MAX_ERROR_LENGTH = 500;
const RELEVANT_ENTRY_TYPES = [
  EntryType.HOLIDAY,
  EntryType.VACATION,
  EntryType.OVERTIME_REDUCTION,
  EntryType.UNPAID_LEAVE,
];

export type CalendarSyncTrigger = "manual" | "scheduler";

export interface CalendarSyncOptions {
  trigger: CalendarSyncTrigger;
  now?: Date;
  /** Nur für Tests: fetch für den Feed */
  feedFetchImpl?: typeof fetch;
  /** Nur für Tests: Timing-Client statt createTimingClient */
  timingClient?: TimingClient;
}

export class CalendarSyncInProgressError extends Error {
  constructor() {
    super("Für dich läuft bereits ein Kalender-Abgleich.");
    this.name = "CalendarSyncInProgressError";
  }
}

export class CalendarNotConfiguredError extends Error {
  constructor() {
    super("Keine Kalender-Feed-URL hinterlegt.");
    this.name = "CalendarNotConfiguredError";
  }
}

/** Fehler mit Meldung, die ins Protokoll darf. */
class CalendarSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarSyncError";
  }
}

// Lock auf globalThis wie beim Timing-Sync: Route und Scheduler können in
// getrennten Bundles laufen, teilen sich aber den Prozess.
const globalForSync = globalThis as unknown as {
  __calendarSyncLocks?: Set<string>;
};
const runningSyncs: Set<string> =
  globalForSync.__calendarSyncLocks ?? new Set();
globalForSync.__calendarSyncLocks = runningSyncs;

export function isCalendarSyncRunning(userId: string): boolean {
  return runningSyncs.has(userId);
}

/** Fehlertext fürs Protokoll: nur bekannte, unkritische Meldungen; nie URL/Token. */
export function sanitizeCalendarError(
  error: unknown,
  secrets: Array<string | undefined> = [],
): string {
  let message =
    error instanceof CalendarFeedError ||
    error instanceof TimewarpParseError ||
    error instanceof CalendarSyncError
      ? error.message
      : "Der Kalender-Abgleich ist fehlgeschlagen.";
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("***");
  }
  return message.slice(0, MAX_ERROR_LENGTH);
}

function emptyStats(trigger: CalendarSyncTrigger): CalendarSyncStats {
  return {
    trigger,
    absences: 0,
    cancelled: 0,
    events: 0,
    unknownTypes: [],
    absencesCreated: 0,
    absencesUpdated: 0,
    absencesCancelled: 0,
    created: 0,
    linked: 0,
    timingCreated: 0,
    timingAdopted: 0,
    deleted: 0,
    unlinked: 0,
    failed: 0,
    timingSkippedReason: null,
    durationMs: 0,
  };
}

function timingErrorText(error: unknown): string {
  // TimingApiError-Meldungen enthalten keinen Token; alles andere generisch
  return error instanceof Error && error.name === "TimingApiError"
    ? error.message
    : "Timing-API nicht erreichbar.";
}

function toStoredAbsence(row: {
  id: string;
  externalUid: string | null;
  kind: AbsenceKind;
  rawType: string | null;
  startDate: Date;
  endDate: Date;
  halfDay: boolean;
  status: AbsenceStatus;
  sequence: number | null;
}): StoredAbsence {
  return {
    ...row,
    startDate: dateKeyFromDbDate(row.startDate),
    endDate: dateKeyFromDbDate(row.endDate),
  };
}

interface TimingSetup {
  /** Client für Timing (auch zum Löschen eigener Einträge), sonst null */
  client: TimingClient | null;
  /** Projekt für neue Einträge, wenn das Schreiben aktiv ist */
  projectRef: string | null;
  skippedReason: string | null;
}

async function prepareTiming(
  userId: string,
  integration: { writeToTiming: boolean; timingProjectId: string | null },
  injected?: TimingClient,
): Promise<TimingSetup> {
  let client: TimingClient | null = injected ?? null;
  let tokenProblem: string | null = null;
  if (!client) {
    const timing = await prisma.timingIntegration.findUnique({
      where: { userId },
      select: { apiTokenEnc: true },
    });
    if (!timing?.apiTokenEnc) {
      tokenProblem = "Kein Timing-Token hinterlegt.";
    } else {
      try {
        client = createTimingClient({
          token: decryptSecret(timing.apiTokenEnc),
          timeoutMs: 15_000,
        });
      } catch {
        tokenProblem = "Timing-Token nicht lesbar, bitte neu hinterlegen.";
      }
    }
  }

  if (!integration.writeToTiming) {
    return { client, projectRef: null, skippedReason: null };
  }
  if (!integration.timingProjectId) {
    return {
      client,
      projectRef: null,
      skippedReason:
        "Kein Timing-Projekt gewählt – Urlaube nur in R-Worktime eingetragen.",
    };
  }
  if (!client) {
    return {
      client,
      projectRef: null,
      skippedReason: `${tokenProblem} Urlaube nur in R-Worktime eingetragen.`,
    };
  }
  return {
    client,
    projectRef: integration.timingProjectId,
    skippedReason: null,
  };
}

type Tx = Prisma.TransactionClient;

interface RunContext {
  tx: Tx;
  userId: string;
  now: Date;
  timing: TimingSetup;
  actions: CalendarSyncAction[];
  stats: CalendarSyncStats;
}

function addAction(
  ctx: RunContext,
  action: CalendarSyncAction["action"],
  date: string,
  kind: string,
  detail: string,
) {
  ctx.actions.push({ date, kind, action, detail });
  if (action !== "skippedUnknownType") ctx.stats[action] += 1;
}

/** Schritt 3: Absence-Zeilen an den Feed angleichen. */
async function applyAbsencePlan(
  ctx: RunContext,
  plan: AbsencePlan,
): Promise<string[]> {
  const { tx, userId, now } = ctx;
  const createdIds: string[] = [];
  for (const data of plan.create) {
    const created = await tx.absence.create({
      data: {
        userId,
        source: AbsenceSource.TIMEWARP,
        externalUid: data.externalUid,
        kind: data.kind,
        rawType: data.rawType,
        startDate: berlinDayStart(data.startDate),
        endDate: berlinDayStart(data.endDate),
        halfDay: data.halfDay,
        status: data.status,
        sequence: data.sequence,
        lastSeenAt: now,
      },
      select: { id: true },
    });
    createdIds.push(created.id);
  }
  for (const { id, data } of plan.update) {
    await tx.absence.update({
      where: { id },
      data: {
        kind: data.kind,
        rawType: data.rawType,
        startDate: berlinDayStart(data.startDate),
        endDate: berlinDayStart(data.endDate),
        halfDay: data.halfDay,
        status: data.status,
        sequence: data.sequence,
      },
    });
  }
  if (plan.seen.length > 0) {
    await tx.absence.updateMany({
      where: { userId, id: { in: plan.seen } },
      data: { lastSeenAt: now },
    });
  }
  if (plan.cancelMissing.length > 0) {
    await tx.absence.updateMany({
      where: { userId, id: { in: plan.cancelMissing } },
      data: { status: AbsenceStatus.CANCELLED },
    });
  }
  ctx.stats.absencesCreated = plan.create.length;
  ctx.stats.absencesUpdated = plan.update.length;
  ctx.stats.absencesCancelled =
    plan.cancelMissing.length +
    plan.update.filter((u) => u.data.status === "CANCELLED").length;
  return createdIds;
}

/** Dauer eines Timing-Eintrags in Stunden (0, wenn unbekannt). */
function timingEntryHours(entry: TimingApiTimeEntry): number {
  if (typeof entry.duration === "number" && Number.isFinite(entry.duration)) {
    return entry.duration / 3600;
  }
  const start = Date.parse(entry.start_date);
  const end = entry.end_date ? Date.parse(entry.end_date) : Number.NaN;
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, (end - start) / 3_600_000)
    : 0;
}

function label(kind: AbsenceKind): string {
  return KIND_LABELS[kind];
}

function localEntryData(
  userId: string,
  create: PlannedCreate,
  timing: {
    externalId: string;
    entry: TimingApiTimeEntry | null;
    adopted: boolean;
  } | null,
): Prisma.TimeEntryUncheckedCreateInput {
  let startTime = create.startTime;
  let endTime = create.endTime;
  let duration = create.hours;
  let title: string | null = label(create.kind);
  let notes: string | null = TIMEWARP_NOTE;
  const chain = timing?.entry?.project?.title_chain;
  const projectPath = Array.isArray(chain)
    ? joinTitleChain(chain) || null
    : null;

  // Übernommener Timing-Eintrag: dessen Zeiten und Texte, wie der Timing-Sync
  if (timing?.adopted && timing.entry?.end_date) {
    const start = new Date(timing.entry.start_date);
    const end = new Date(timing.entry.end_date);
    if (
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      end > start
    ) {
      startTime = start;
      endTime = end;
      duration =
        Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100;
    }
    title = timing.entry.title?.trim() || title;
    notes = timing.entry.notes?.trim() || null;
  }

  return {
    userId,
    date: berlinDayStart(create.date),
    startTime,
    endTime,
    duration,
    type: create.entryType,
    title,
    notes,
    description: [title, notes].filter(Boolean).join(" - ") || null,
    projectPath,
    externalId: timing?.externalId ?? null,
    billingStatus: timing ? "not_billable" : null,
    source: EntrySource.TIMEWARP,
    absenceId: create.absenceId,
  };
}

/** Schritt 4 ausführen: entkoppeln, löschen, verknüpfen, anlegen. */
async function applyDayPlan(
  ctx: RunContext,
  plan: DayPlan,
  unavailableYears: ReadonlySet<number>,
  dailyHours: number,
): Promise<void> {
  const { tx, userId, timing } = ctx;

  for (const unlink of plan.unlink) {
    await tx.timeEntry.updateMany({
      where: { id: unlink.entryId, userId },
      data: { absenceId: null },
    });
    addAction(
      ctx,
      "unlinked",
      unlink.date,
      unlink.kind,
      "Eintrag bleibt, gehört aber nicht mehr zur Abwesenheit.",
    );
  }

  const failedRemovals = new Set<string>();
  for (const remove of plan.remove) {
    let detail =
      remove.reason === "halfDayChanged"
        ? "Ganzer/halber Tag geändert – wird ersetzt."
        : remove.reason === "kindChanged"
          ? "Art der Abwesenheit geändert – wird ersetzt."
          : remove.reason === "duplicate"
            ? "Doppelter Eintrag entfernt."
            : "Tag gehört nicht mehr zur Abwesenheit.";
    if (remove.externalId) {
      if (timing.client) {
        try {
          await timing.client.deleteTimeEntry(remove.externalId);
          detail += " Auch in Timing gelöscht.";
        } catch (error) {
          failedRemovals.add(remove.entryId);
          addAction(
            ctx,
            "failed",
            remove.date,
            remove.kind,
            `Löschen in Timing fehlgeschlagen: ${timingErrorText(error)}`,
          );
          continue;
        }
      } else {
        detail += " In Timing bitte von Hand löschen (kein Timing-Token).";
      }
    }
    await tx.timeEntry.deleteMany({ where: { id: remove.entryId, userId } });
    addAction(ctx, "deleted", remove.date, remove.kind, detail);
  }

  for (const link of plan.link) {
    await tx.timeEntry.updateMany({
      where: { id: link.entryId, userId, absenceId: null },
      data: { absenceId: link.absenceId },
    });
    addAction(
      ctx,
      "linked",
      link.date,
      link.kind,
      "Vorhandenen Eintrag mit der Abwesenheit verknüpft.",
    );
  }

  const creates: PlannedCreate[] = [];
  for (const create of plan.create) {
    if (create.replaces && failedRemovals.has(create.replaces)) continue;
    if (unavailableYears.has(Number(create.date.slice(0, 4)))) {
      addAction(
        ctx,
        "failed",
        create.date,
        create.kind,
        "Feiertage nicht abrufbar – Tag wird beim nächsten Lauf eingetragen.",
      );
      continue;
    }
    creates.push(create);
  }

  // Timing: vorhandene Einträge im Projekt einmal für den ganzen Zeitraum suchen
  const toTiming =
    timing.client && timing.projectRef
      ? creates.filter((create) => create.toTiming)
      : [];
  const candidatesByDate = new Map<string, TimingApiTimeEntry[]>();
  // Tage mit einem Timing-Eintrag im Projekt, der lokal schon zugeordnet ist:
  // nicht übernehmbar, aber auch kein zweiter Eintrag in Timing
  const occupiedInTiming = new Set<string>();
  let searchError: string | null = null;
  if (toTiming.length > 0 && timing.client && timing.projectRef) {
    const dates = toTiming.map((create) => create.date).sort();
    try {
      const found = await timing.client.listTimeEntries(
        { from: dates[0], to: dates[dates.length - 1] },
        { projects: [timing.projectRef], includeChildProjects: true },
      );
      const selves = found.map((entry) => entry.self);
      const usedLocally = new Set(
        selves.length > 0
          ? (
              await tx.timeEntry.findMany({
                where: { userId, externalId: { in: selves } },
                select: { externalId: true },
              })
            ).map((row) => row.externalId)
          : [],
      );
      for (const entry of found) {
        if (entry.is_running) continue;
        const start = new Date(entry.start_date);
        if (Number.isNaN(start.getTime())) continue;
        const key = berlinDateKey(start);
        if (usedLocally.has(entry.self)) {
          occupiedInTiming.add(key);
          continue;
        }
        const list = candidatesByDate.get(key) ?? [];
        list.push(entry);
        candidatesByDate.set(key, list);
      }
    } catch (error) {
      searchError = timingErrorText(error);
    }
  }

  for (const create of creates) {
    const writeTiming =
      create.toTiming && timing.client !== null && timing.projectRef !== null;
    if (!writeTiming) {
      await tx.timeEntry.create({ data: localEntryData(userId, create, null) });
      // Hinweis, wenn der Tag eigentlich nach Timing gehört hätte
      const hint =
        writesToTiming(create.kind) && timing.skippedReason
          ? ` Nicht in Timing: ${timing.skippedReason}`
          : "";
      addAction(
        ctx,
        "created",
        create.date,
        create.kind,
        `${label(create.kind)}${create.halfDay ? " (halber Tag)" : ""} eingetragen.${hint}`,
      );
      continue;
    }
    if (searchError) {
      addAction(
        ctx,
        "failed",
        create.date,
        create.kind,
        `Suche in Timing fehlgeschlagen: ${searchError}`,
      );
      continue;
    }

    // Übernommen wird nur ein Eintrag, der zu ganz/halb passt – sonst hielte
    // der nächste Lauf ihn für geändert und löschte ihn in Timing
    const sameDay = candidatesByDate.get(create.date) ?? [];
    const index = sameDay.findIndex(
      (entry) =>
        isHalfDayEntry(timingEntryHours(entry), dailyHours) === create.halfDay,
    );
    const candidate = index >= 0 ? sameDay.splice(index, 1)[0] : null;
    if (
      !candidate &&
      (sameDay.length > 0 || occupiedInTiming.has(create.date))
    ) {
      await tx.timeEntry.create({ data: localEntryData(userId, create, null) });
      addAction(
        ctx,
        "created",
        create.date,
        create.kind,
        `${label(create.kind)} eingetragen. Nicht in Timing: dort gibt es an dem Tag schon einen Eintrag im Urlaubsprojekt.`,
      );
      continue;
    }
    if (candidate) {
      await tx.timeEntry.create({
        data: localEntryData(userId, create, {
          externalId: candidate.self,
          entry: candidate,
          adopted: true,
        }),
      });
      addAction(
        ctx,
        "timingAdopted",
        create.date,
        create.kind,
        "Vorhandenen Timing-Eintrag übernommen.",
      );
      continue;
    }

    let created: TimingApiTimeEntry;
    try {
      created = await (timing.client as TimingClient).createTimeEntry({
        start: create.startTime,
        end: create.endTime,
        projectRef: timing.projectRef as string,
        title: label(create.kind),
        notes: TIMEWARP_NOTE,
        billingStatus: "not_billable",
      });
    } catch (error) {
      addAction(
        ctx,
        "failed",
        create.date,
        create.kind,
        `Anlegen in Timing fehlgeschlagen: ${timingErrorText(error)}`,
      );
      continue;
    }
    const clash = await tx.timeEntry.findFirst({
      where: { userId, externalId: created.self },
      select: { id: true },
    });
    if (clash) {
      // Sollte nie passieren; ohne Prüfung bräche der Unique-Key den ganzen Lauf ab
      addAction(
        ctx,
        "failed",
        create.date,
        create.kind,
        "Timing-ID ist schon vergeben – Eintrag nicht gespeichert.",
      );
      continue;
    }
    await tx.timeEntry.create({
      data: localEntryData(userId, create, {
        externalId: created.self,
        entry: created,
        adopted: false,
      }),
    });
    addAction(
      ctx,
      "timingCreated",
      create.date,
      create.kind,
      `${label(create.kind)}${create.halfDay ? " (halber Tag)" : ""} in Timing eingetragen.`,
    );
  }
}

async function runInTransaction(
  tx: Tx,
  ctx: Omit<RunContext, "tx">,
  feed: TimewarpFeedResult,
  schedule: { workDays: number[]; dailyHours: number },
): Promise<void> {
  const runCtx: RunContext = { ...ctx, tx };
  const { userId, now } = ctx;
  await withUserAbsenceLock(tx, userId);

  const today = berlinTodayKey(now);
  const storedRows = await tx.absence.findMany({
    where: { userId, source: AbsenceSource.TIMEWARP },
    select: {
      id: true,
      externalUid: true,
      kind: true,
      rawType: true,
      startDate: true,
      endDate: true,
      halfDay: true,
      status: true,
      sequence: true,
    },
  });
  const stored = storedRows.map(toStoredAbsence);

  // Schutz: Ein Feed ganz ohne Termine (Störung bei Timewarp?) würde alle
  // künftigen Abwesenheiten stornieren und ihre Timing-Einträge löschen.
  if (
    feed.totalEvents === 0 &&
    stored.some((a) => a.status === "ACTIVE" && a.startDate > today)
  ) {
    throw new CalendarSyncError(
      "Der Feed enthält keine Termine, obwohl künftige Abwesenheiten gespeichert sind – Abgleich zur Sicherheit abgebrochen.",
    );
  }

  const absencePlan = planAbsences(stored, feed.absences, today);
  await applyAbsencePlan(runCtx, absencePlan);

  // Tage abgleichen: Abwesenheiten aus dem Feed und stornierte (Aufräumen).
  // Vergangene, aus dem Feed gefallene bleiben unangetastet.
  const feedUids = new Set(feed.absences.map((a) => a.uid));
  const current = await tx.absence.findMany({
    where: {
      userId,
      source: AbsenceSource.TIMEWARP,
      OR: [
        { externalUid: { in: Array.from(feedUids) } },
        { status: AbsenceStatus.CANCELLED },
      ],
    },
    select: {
      id: true,
      kind: true,
      startDate: true,
      endDate: true,
      halfDay: true,
      status: true,
      suppressedDates: true,
    },
  });
  const absences: DayPlanAbsence[] = current.map((row) => ({
    id: row.id,
    kind: row.kind,
    startDate: dateKeyFromDbDate(row.startDate),
    endDate: dateKeyFromDbDate(row.endDate),
    halfDay: row.halfDay,
    status: row.status,
    suppressedDates: row.suppressedDates,
  }));
  const active = absences.filter((a) => a.status === "ACTIVE");
  if (absences.length === 0) return;

  let rangeWhere: Prisma.TimeEntryWhereInput[] = [];
  let officialHolidays: Record<string, string> = {};
  let unavailableYears = new Set<number>();
  if (active.length > 0) {
    const from = active.map((a) => a.startDate).sort()[0];
    const to = active.map((a) => a.endDate).sort()[active.length - 1];
    const holidays = await loadOfficialHolidays(yearsOfRange(from, to), now);
    officialHolidays = holidays.names;
    unavailableYears = new Set(holidays.unavailableYears);
    rangeWhere = [
      {
        date: { gte: berlinDayStart(from), lte: berlinDayStart(to) },
        type: { in: RELEVANT_ENTRY_TYPES },
      },
    ];
  }

  const entryRows = await tx.timeEntry.findMany({
    where: {
      userId,
      OR: [{ absenceId: { in: absences.map((a) => a.id) } }, ...rangeWhere],
    },
    select: {
      id: true,
      date: true,
      type: true,
      source: true,
      absenceId: true,
      externalId: true,
      duration: true,
    },
  });

  const dayPlan = planDays({
    absences,
    entries: entryRows.map((row) => ({
      id: row.id,
      date: dateKeyFromDbDate(row.date),
      type: row.type,
      source: row.source,
      absenceId: row.absenceId,
      externalId: row.externalId,
      duration: Number(row.duration),
    })),
    workDays: schedule.workDays,
    dailyHours: schedule.dailyHours,
    officialHolidays,
    timingEnabled: ctx.timing.projectRef !== null,
  });
  await applyDayPlan(runCtx, dayPlan, unavailableYears, schedule.dailyHours);
}

async function writeLogAndStatus(
  userId: string,
  result: CalendarSyncResult,
  startedAt: Date,
): Promise<void> {
  const finishedAt = new Date();
  const warning =
    result.status === CALENDAR_SYNC_STATUS_SUCCESS && result.stats.failed > 0
      ? `${result.stats.failed} Aktion(en) fehlgeschlagen – der nächste Lauf versucht es erneut.`
      : null;
  try {
    await prisma.absenceSyncLog.create({
      data: {
        userId,
        startedAt,
        finishedAt,
        status: result.status,
        error: result.error ?? warning,
        actions: result.actions as unknown as Prisma.InputJsonValue,
      },
    });
    const old = await prisma.absenceSyncLog.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      skip: CALENDAR_SYNC_LOG_KEEP,
      select: { id: true },
    });
    if (old.length > 0) {
      await prisma.absenceSyncLog.deleteMany({
        where: { userId, id: { in: old.map((row) => row.id) } },
      });
    }
  } catch (error) {
    console.error(
      `[calendar-sync] Protokoll für User ${userId} nicht gespeichert:`,
      error instanceof Error ? error.name : "unbekannt",
    );
  }

  // lastSyncAt auch bei Fehlern setzen, sonst versucht der Scheduler es bei
  // jedem Tick erneut
  await prisma.calendarIntegration
    .update({
      where: { userId },
      data: {
        lastSyncAt: finishedAt,
        lastSyncStatus: result.status,
        lastSyncError: result.error ?? warning,
        lastSyncStats: result.stats as unknown as Prisma.InputJsonValue,
      },
    })
    .catch(() => undefined);
}

/**
 * Gleicht den Timewarp-Feed eines Nutzers ab. Pro Nutzer läuft höchstens ein
 * Abgleich gleichzeitig (Button und Scheduler); ein Fehler im Lauf endet mit
 * status "error" (kein throw), damit Protokoll und Status stimmen.
 */
export async function syncCalendarForUser(
  userId: string,
  options: CalendarSyncOptions,
): Promise<CalendarSyncResult> {
  if (runningSyncs.has(userId)) throw new CalendarSyncInProgressError();
  runningSyncs.add(userId);

  try {
    const integration = await prisma.calendarIntegration.findUnique({
      where: { userId },
    });
    if (!integration?.feedUrlEnc) throw new CalendarNotConfiguredError();

    const now = options.now ?? new Date();
    const startedAt = new Date();
    const stats = emptyStats(options.trigger);
    const actions: CalendarSyncAction[] = [];
    let feedUrl: string | undefined;
    let result: CalendarSyncResult;

    try {
      try {
        feedUrl = decryptSecret(integration.feedUrlEnc);
      } catch {
        throw new CalendarSyncError(
          "Die Feed-URL ist nicht lesbar – bitte neu hinterlegen.",
        );
      }

      // Erst laden und auswerten – scheitert das, wird nichts geändert
      const feed = parseTimewarpFeed(
        await fetchCalendarFeed(feedUrl, { fetchImpl: options.feedFetchImpl }),
      );
      Object.assign(stats, summarizeFeed(feed));
      for (const unknown of feed.unknown) {
        actions.push({
          date: unknown.startDate,
          kind: unknown.rawType,
          action: "skippedUnknownType",
          detail: `Unbekannter Typ „${unknown.rawType}“ – übersprungen.`,
        });
      }

      const [timing, settings] = await Promise.all([
        prepareTiming(userId, integration, options.timingClient),
        getUserSettings(userId),
      ]);
      stats.timingSkippedReason = timing.skippedReason;
      const schedule = {
        workDays: settings.workDays,
        dailyHours: dailyTargetHours(
          settings.weeklyWorkHours,
          settings.workDays,
        ),
      };

      const dayActions: CalendarSyncAction[] = [];
      await prisma.$transaction(
        (tx) =>
          runInTransaction(
            tx,
            { userId, now, timing, actions: dayActions, stats },
            feed,
            schedule,
          ),
        { timeout: TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
      );
      actions.push(...dayActions);
      result = { status: CALENDAR_SYNC_STATUS_SUCCESS, stats, actions };
    } catch (error) {
      if (
        !(error instanceof CalendarFeedError) &&
        !(error instanceof TimewarpParseError) &&
        !(error instanceof CalendarSyncError)
      ) {
        console.error(
          `[calendar-sync] User ${userId} fehlgeschlagen:`,
          sanitizeCalendarError(
            new CalendarSyncError(
              error instanceof Error ? error.message : String(error),
            ),
            [feedUrl],
          ),
        );
      }
      // Tagesaktionen der abgebrochenen Transaktion sind verworfen; nur die
      // Feed-Meldungen (unbekannte Typen) bleiben im Protokoll
      result = {
        status: CALENDAR_SYNC_STATUS_ERROR,
        error: sanitizeCalendarError(error, [feedUrl]),
        stats: {
          ...stats,
          absencesCreated: 0,
          absencesUpdated: 0,
          absencesCancelled: 0,
          created: 0,
          linked: 0,
          timingCreated: 0,
          timingAdopted: 0,
          deleted: 0,
          unlinked: 0,
          failed: 0,
        },
        actions: actions.filter((a) => a.action === "skippedUnknownType"),
      };
    }

    result.stats.durationMs = Date.now() - startedAt.getTime();
    if (result.status === CALENDAR_SYNC_STATUS_SUCCESS) {
      overtimeService.invalidateCache(userId);
    }
    await writeLogAndStatus(userId, result, startedAt);
    return result;
  } finally {
    runningSyncs.delete(userId);
  }
}
