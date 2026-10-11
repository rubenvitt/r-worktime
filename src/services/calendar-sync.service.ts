// Kalender-Abgleich: Timewarp-Feed → Abwesenheiten → Tage → Timing → Protokoll.
// Regeln: docs/superpowers/specs/2026-10-11-timewarp-absences-design.md, „Abgleich“.
//
// Ablauf eines Laufs (pro Nutzer höchstens einer, Laufschutz im Prozess):
// 1. Feed laden und auswerten – ohne Transaktion; scheitert das, bleibt alles.
// 2. Kurze Transaktion unter der Abwesenheits-Sperre (dieselbe wie Dialog,
//    DELETE /api/absences/[id] und Löschen von Einträgen): Absence-Zeilen
//    an den Feed angleichen.
// 3. Tage planen und alle Timing-Aufrufe (suchen, anlegen, löschen) ohne
//    Transaktion und ohne Sperre – der Dialog muss nicht auf Timing warten.
// 4. Kurze Transaktion unter der Sperre: Tage neu lesen, neu planen und nur
//    anwenden, was der frische Plan noch will. In Timing angelegte Einträge,
//    die der frische Plan nicht mehr braucht (z. B. Tag inzwischen per Dialog
//    belegt), werden danach in Timing wieder gelöscht.
//
// Eigene Timing-Einträge erkennt der Abgleich an der Notiz „Aus Timewarp“.
// Fremde Urlaubseinträge in Timing werden nur verknüpft (lokal wie vom
// Timing-Sync angelegt) und nie gelöscht. Timing-Fehler je Tag werden
// abgefangen (Aktion „failed“, der nächste Lauf sucht erst in Timing und legt
// dann an → keine Duplikate). DB-Fehler brechen den Lauf ab.

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
  type DayPlanEntry,
  isHalfDayEntry,
  isOwnTimingNote,
  type PlannedCreate,
  planDays,
  TIMEWARP_NOTE,
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
import type { TimingApiTimeEntry, TimingClient } from "@/lib/timing/client";
import { DEFAULT_PROJECT_ROOTS } from "@/lib/timing/constants";
import {
  mapApiEntry,
  type SyncEntryData,
  toSyncEntryRow,
} from "@/lib/timing/mapping";
import { joinTitleChain } from "@/lib/timing/project-path";
import { loadOfficialHolidays } from "@/services/holiday.service";
import { overtimeService } from "@/services/overtime.service";
import { getUserSettings } from "@/services/settings.service";
import { timingClientForUser } from "@/services/timing-entries.service";

export { TIMEWARP_NOTE };

// Die Transaktionen enthalten nur DB-Zugriffe; die Werte gelten für viele
// Zeilen beim ersten Lauf, nicht für Wartezeiten auf Timing
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 };
const MAX_ERROR_LENGTH = 500;
const RELEVANT_ENTRY_TYPES = [
  EntryType.HOLIDAY,
  EntryType.VACATION,
  EntryType.SICK,
  EntryType.OVERTIME_REDUCTION,
  EntryType.UNPAID_LEAVE,
];

export type CalendarSyncTrigger = "manual" | "scheduler";

export interface CalendarSyncOptions {
  trigger: CalendarSyncTrigger;
  now?: Date;
  /** Nur für Tests: fetch für den Feed */
  feedFetchImpl?: typeof fetch;
  /** Nur für Tests: Timing-Client statt des Clients aus dem Nutzer-Token */
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

// Laufschutz auf globalThis wie beim Timing-Sync: Route und Scheduler können
// in getrennten Bundles laufen, teilen sich aber den Prozess.
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

const DAY_COUNTERS = [
  "created",
  "linked",
  "timingCreated",
  "timingAdopted",
  "deleted",
  "unlinked",
  "failed",
] as const;

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
  /**
   * Projekt-Wurzeln des Timing-Syncs: Nur fremde Einträge darin werden
   * verknüpft – alles andere würde der Timing-Sync als „in Timing gelöscht“
   * entfernen und den Tag unterdrücken
   */
  projectRoots: string[];
}

async function prepareTiming(
  userId: string,
  integration: { writeToTiming: boolean; timingProjectId: string | null },
  injected?: TimingClient,
): Promise<TimingSetup> {
  let client: TimingClient | null = injected ?? null;
  let tokenProblem: string | null = null;
  if (!client) {
    const timing = await timingClientForUser(userId);
    client = timing.client;
    tokenProblem = timing.problem;
  }
  const timingSettings = await prisma.timingIntegration.findUnique({
    where: { userId },
    select: { projectRoots: true },
  });
  // Wie der Timing-Sync (getPublicTimingSettings): ohne Zeile die Standard-Wurzeln
  const projectRoots = timingSettings?.projectRoots ?? DEFAULT_PROJECT_ROOTS;

  if (!integration.writeToTiming) {
    return { client, projectRef: null, skippedReason: null, projectRoots };
  }
  if (!integration.timingProjectId) {
    return {
      client,
      projectRef: null,
      skippedReason:
        "Kein Timing-Projekt gewählt – Urlaube nur in R-Worktime eingetragen.",
      projectRoots,
    };
  }
  if (!client) {
    return {
      client,
      projectRef: null,
      skippedReason: `${tokenProblem} Urlaube nur in R-Worktime eingetragen.`,
      projectRoots,
    };
  }
  return {
    client,
    projectRef: integration.timingProjectId,
    skippedReason: null,
    projectRoots,
  };
}

type Tx = Prisma.TransactionClient;
type Db = Pick<Tx, "absence" | "timeEntry">;

interface RunContext {
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
  tx: Tx,
  ctx: RunContext,
  plan: AbsencePlan,
): Promise<void> {
  const { userId, now } = ctx;
  for (const data of plan.create) {
    await tx.absence.create({
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
}

/** Transaktion 1: Sicherheitsprüfung und Absence-Zeilen. */
async function syncAbsences(
  tx: Tx,
  ctx: RunContext,
  feed: TimewarpFeedResult,
): Promise<AbsencePlan> {
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

  const plan = planAbsences(stored, feed.absences, today);
  await applyAbsencePlan(tx, ctx, plan);
  return plan;
}

interface Holidays {
  names: Record<string, string>;
  unavailableYears: ReadonlySet<number>;
}

interface DayState {
  absences: DayPlanAbsence[];
  entries: DayPlanEntry[];
}

/**
 * Abwesenheiten, deren Tage abgeglichen werden (aus dem Feed und stornierte
 * zum Aufräumen; vergangene, aus dem Feed gefallene bleiben unangetastet),
 * und die Einträge dazu.
 */
async function loadDayState(
  db: Db,
  userId: string,
  feedUids: readonly string[],
): Promise<DayState> {
  const rows = await db.absence.findMany({
    where: {
      userId,
      source: AbsenceSource.TIMEWARP,
      OR: [
        { externalUid: { in: [...feedUids] } },
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
  const absences: DayPlanAbsence[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    startDate: dateKeyFromDbDate(row.startDate),
    endDate: dateKeyFromDbDate(row.endDate),
    halfDay: row.halfDay,
    status: row.status,
    suppressedDates: row.suppressedDates,
  }));
  if (absences.length === 0) return { absences, entries: [] };

  const active = absences.filter((a) => a.status === "ACTIVE");
  const rangeWhere: Prisma.TimeEntryWhereInput[] =
    active.length > 0
      ? [
          {
            date: {
              gte: berlinDayStart(active.map((a) => a.startDate).sort()[0]),
              lte: berlinDayStart(
                active.map((a) => a.endDate).sort()[active.length - 1],
              ),
            },
            type: { in: RELEVANT_ENTRY_TYPES },
          },
        ]
      : [];

  const entryRows = await db.timeEntry.findMany({
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
  return {
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
  };
}

async function loadHolidaysFor(
  absences: readonly DayPlanAbsence[],
  now: Date,
): Promise<Holidays> {
  const active = absences.filter((a) => a.status === "ACTIVE");
  if (active.length === 0) return { names: {}, unavailableYears: new Set() };
  const from = active.map((a) => a.startDate).sort()[0];
  const to = active.map((a) => a.endDate).sort()[active.length - 1];
  const holidays = await loadOfficialHolidays(yearsOfRange(from, to), now);
  return {
    names: holidays.names,
    unavailableYears: new Set(holidays.unavailableYears),
  };
}

function planFor(
  state: DayState,
  holidays: Holidays,
  schedule: { workDays: number[]; dailyHours: number },
  timing: TimingSetup,
): DayPlan {
  return planDays({
    absences: state.absences,
    entries: state.entries,
    workDays: schedule.workDays,
    dailyHours: schedule.dailyHours,
    officialHolidays: holidays.names,
    timingEnabled: timing.projectRef !== null,
  });
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

/** Schlüssel eines geplanten Tages über beide Pläne hinweg */
function createKey(create: PlannedCreate): string {
  return `${create.absenceId}|${create.date}|${create.entryType}|${create.halfDay}`;
}

/** Lokaler Eintrag des Abgleichs (source TIMEWARP). */
function ownEntryData(
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

  // Übernommener eigener Timing-Eintrag: dessen Zeiten und Texte
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

/**
 * Timing-Eintrag so aufbereitet, wie ihn der Timing-Sync speichern würde;
 * null, wenn der Timing-Sync ihn nicht übernähme (z. B. außerhalb seiner
 * Projekt-Wurzeln) – dann darf er auch nicht als TIMING_SYNC verknüpft werden.
 */
function foreignEntryData(
  entry: TimingApiTimeEntry,
  projectRoots: string[],
): SyncEntryData | null {
  const mapped = mapApiEntry(entry, projectRoots);
  return mapped.kept ? mapped.entry : null;
}

type TimingOutcome =
  /** Eigener Eintrag (Notiz „Aus Timewarp“) gefunden: übernehmen */
  | { type: "adoptOwn"; entry: TimingApiTimeEntry }
  /** Fremder Urlaubseintrag: nur verknüpfen, nie löschen */
  | { type: "linkForeign"; entry: TimingApiTimeEntry; data: SyncEntryData }
  /** In Timing belegt, aber nicht nutzbar: nur lokal eintragen */
  | { type: "occupied" }
  /**
   * Beginnt erst in der Zukunft – Timing lehnt das ab („The start date must
   * not lie in the future“, HTTP 422): nur lokal eintragen, ein späterer
   * Lauf trägt den Tag nach, sobald er begonnen hat
   */
  | { type: "notYet" }
  /** In Timing neu angelegt */
  | { type: "created"; entry: TimingApiTimeEntry; create: PlannedCreate }
  | { type: "failed"; detail: string };

/** In Timing angelegt, aber vom frischen Plan nicht mehr gebraucht */
interface Orphan {
  entry: TimingApiTimeEntry;
  create: PlannedCreate;
}

interface TimingWork {
  /** Lokale Eintrags-IDs, deren Timing-Eintrag gelöscht ist (auch 404) */
  deleted: Set<string>;
  /** Lokale Eintrags-ID → Fehlertext */
  deleteFailed: Map<string, string>;
  outcomes: Map<string, TimingOutcome>;
}

/** Lässt sich der geplante Tag überhaupt anlegen (Feiertage bekannt)? */
function creatable(
  create: PlannedCreate,
  holidays: Holidays,
  failedRemovals: ReadonlySet<string>,
): "ok" | "holidaysUnavailable" | "removalFailed" {
  if (create.replaces && failedRemovals.has(create.replaces)) {
    return "removalFailed";
  }
  if (holidays.unavailableYears.has(Number(create.date.slice(0, 4)))) {
    return "holidaysUnavailable";
  }
  return "ok";
}

/**
 * Schritt 3: alle Timing-Aufrufe für den Plan, ohne Transaktion. Schreibt
 * nichts lokal; das Ergebnis wendet Transaktion 2 an.
 */
async function runTimingCalls(
  ctx: RunContext,
  plan: DayPlan,
  holidays: Holidays,
  dailyHours: number,
): Promise<TimingWork> {
  const { timing, userId } = ctx;
  const work: TimingWork = {
    deleted: new Set(),
    deleteFailed: new Map(),
    outcomes: new Map(),
  };
  const client = timing.client;
  if (!client) return work;

  for (const remove of plan.remove) {
    if (!remove.externalId) continue;
    try {
      await client.deleteTimeEntry(remove.externalId);
      work.deleted.add(remove.entryId);
    } catch (error) {
      work.deleteFailed.set(remove.entryId, timingErrorText(error));
    }
  }

  const projectRef = timing.projectRef;
  if (!projectRef) return work;
  const failedRemovals = new Set(work.deleteFailed.keys());
  const toTiming: PlannedCreate[] = [];
  for (const create of plan.create) {
    if (!create.toTiming) continue;
    if (creatable(create, holidays, failedRemovals) !== "ok") continue;
    if (create.startTime.getTime() > ctx.now.getTime()) {
      work.outcomes.set(createKey(create), { type: "notYet" });
      continue;
    }
    toTiming.push(create);
  }
  if (toTiming.length === 0) return work;

  // Vorhandene Einträge im Projekt einmal für den ganzen Zeitraum suchen
  const candidatesByDate = new Map<string, TimingApiTimeEntry[]>();
  // Tage mit einem Timing-Eintrag im Projekt, der lokal schon zugeordnet ist:
  // nicht nutzbar, aber auch kein zweiter Eintrag in Timing
  const occupiedInTiming = new Set<string>();
  const dates = toTiming.map((create) => create.date).sort();
  try {
    const found = await client.listTimeEntries(
      { from: dates[0], to: dates[dates.length - 1] },
      { projects: [projectRef], includeChildProjects: true },
    );
    const selves = found.map((entry) => entry.self);
    const usedLocally = new Set(
      selves.length > 0
        ? (
            await prisma.timeEntry.findMany({
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
    const detail = `Suche in Timing fehlgeschlagen: ${timingErrorText(error)}`;
    for (const create of toTiming) {
      work.outcomes.set(createKey(create), { type: "failed", detail });
    }
    return work;
  }

  const take = (list: TimingApiTimeEntry[], entry: TimingApiTimeEntry) => {
    list.splice(list.indexOf(entry), 1);
    return entry;
  };

  for (const create of toTiming) {
    const key = createKey(create);
    const sameDay = candidatesByDate.get(create.date) ?? [];
    const own = sameDay.filter((entry) => isOwnTimingNote(entry.notes));
    // Eigener Eintrag: bevorzugt der passende (ganz/halb); ein unpassender
    // eigener wird trotzdem übernommen und beim nächsten Lauf ersetzt
    const ownMatch =
      own.find(
        (entry) =>
          isHalfDayEntry(timingEntryHours(entry), dailyHours) ===
          create.halfDay,
      ) ?? own[0];
    if (ownMatch) {
      work.outcomes.set(key, {
        type: "adoptOwn",
        entry: take(sameDay, ownMatch),
      });
      continue;
    }
    // Fremder Eintrag desselben Typs: verknüpfen, ganz/halb egal
    const foreign = sameDay
      .map((entry) => ({
        entry,
        data: foreignEntryData(entry, timing.projectRoots),
      }))
      .find(({ data }) => data?.type === create.entryType);
    if (foreign?.data) {
      work.outcomes.set(key, {
        type: "linkForeign",
        entry: take(sameDay, foreign.entry),
        data: foreign.data,
      });
      continue;
    }
    if (sameDay.length > 0 || occupiedInTiming.has(create.date)) {
      work.outcomes.set(key, { type: "occupied" });
      continue;
    }
    try {
      const created = await client.createTimeEntry({
        start: create.startTime,
        end: create.endTime,
        projectRef,
        title: label(create.kind),
        notes: TIMEWARP_NOTE,
        billingStatus: "not_billable",
      });
      work.outcomes.set(key, { type: "created", entry: created, create });
    } catch (error) {
      work.outcomes.set(key, {
        type: "failed",
        detail: `Anlegen in Timing fehlgeschlagen: ${timingErrorText(error)}`,
      });
    }
  }
  return work;
}

/**
 * Transaktion 2: Tage frisch planen und anwenden. Gibt die in Timing
 * angelegten Einträge zurück, die der frische Plan nicht mehr braucht.
 */
async function applyDays(
  tx: Tx,
  ctx: RunContext,
  feedUids: readonly string[],
  holidays: Holidays,
  schedule: { workDays: number[]; dailyHours: number },
  work: TimingWork,
): Promise<Orphan[]> {
  const { userId, timing } = ctx;
  await withUserAbsenceLock(tx, userId);

  const state = await loadDayState(tx, userId, feedUids);
  const plan = planFor(state, holidays, schedule, timing);
  const consumed = new Set<string>();

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
        const error = work.deleteFailed.get(remove.entryId);
        if (error) {
          failedRemovals.add(remove.entryId);
          addAction(
            ctx,
            "failed",
            remove.date,
            remove.kind,
            `Löschen in Timing fehlgeschlagen: ${error}`,
          );
          continue;
        }
        if (!work.deleted.has(remove.entryId)) {
          // Erst während des Laufs hinzugekommen: der nächste Lauf löscht
          failedRemovals.add(remove.entryId);
          continue;
        }
        detail += " Auch in Timing gelöscht.";
      } else {
        detail += " In Timing bitte von Hand löschen (kein Timing-Token).";
      }
    }
    await tx.timeEntry.deleteMany({
      where: { id: remove.entryId, userId, source: EntrySource.TIMEWARP },
    });
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

  const externalIdInUse = async (externalId: string) =>
    (await tx.timeEntry.findFirst({
      where: { userId, externalId },
      select: { id: true },
    })) !== null;

  const createLocalOnly = async (create: PlannedCreate, hint: string) => {
    await tx.timeEntry.create({ data: ownEntryData(userId, create, null) });
    addAction(
      ctx,
      "created",
      create.date,
      create.kind,
      `${label(create.kind)}${create.halfDay ? " (halber Tag)" : ""} eingetragen.${hint}`,
    );
  };
  const occupiedHint =
    " Nicht in Timing: dort gibt es an dem Tag schon einen Eintrag im Urlaubsprojekt.";
  const notYetHint =
    " In Timing wird der Tag nachgetragen, sobald er begonnen hat – Timing nimmt keine Einträge in der Zukunft an.";

  /**
   * Eigenen, bisher nur lokalen Eintrag nach Timing nachtragen. Belegt Timing
   * den Tag schon anders oder ist der Eintrag inzwischen weg, bleibt alles,
   * wie es ist – ohne Aktion, damit ein Lauf ohne Änderung leer bleibt.
   */
  const upgradeLocalOnly = async (create: PlannedCreate, entryId: string) => {
    if (creatable(create, holidays, failedRemovals) !== "ok") return;
    if (!create.toTiming || !timing.client || !timing.projectRef) return;
    const key = createKey(create);
    const outcome = work.outcomes.get(key);
    if (!outcome || outcome.type === "occupied" || outcome.type === "notYet") {
      return;
    }
    if (outcome.type === "failed") {
      addAction(ctx, "failed", create.date, create.kind, outcome.detail);
      return;
    }
    if (await externalIdInUse(outcome.entry.self)) return;
    const current = await tx.timeEntry.findFirst({
      where: {
        id: entryId,
        userId,
        source: EntrySource.TIMEWARP,
        externalId: null,
        absenceId: create.absenceId,
      },
      select: { id: true },
    });
    if (!current) return;
    consumed.add(key);

    if (outcome.type === "linkForeign") {
      await tx.timeEntry.deleteMany({
        where: { id: current.id, userId, source: EntrySource.TIMEWARP },
      });
      await tx.timeEntry.create({
        data: {
          userId,
          ...toSyncEntryRow(outcome.data),
          type: create.entryType,
          absenceId: create.absenceId,
        },
      });
      addAction(
        ctx,
        "linked",
        create.date,
        create.kind,
        "Vorhandenen Timing-Eintrag verknüpft – er bleibt in Timing unangetastet.",
      );
      return;
    }

    const adopted = outcome.type === "adoptOwn";
    const data = ownEntryData(userId, create, {
      externalId: outcome.entry.self,
      entry: outcome.entry,
      adopted,
    });
    await tx.timeEntry.update({
      where: { id: current.id },
      data: {
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        title: data.title,
        notes: data.notes,
        description: data.description,
        projectPath: data.projectPath,
        externalId: data.externalId,
        billingStatus: data.billingStatus,
      },
    });
    addAction(
      ctx,
      adopted ? "timingAdopted" : "timingCreated",
      create.date,
      create.kind,
      adopted
        ? "Eigenen Timing-Eintrag übernommen."
        : `${label(create.kind)}${create.halfDay ? " (halber Tag)" : ""} in Timing nachgetragen.`,
    );
  };

  for (const create of plan.create) {
    if (create.upgrades) {
      await upgradeLocalOnly(create, create.upgrades);
      continue;
    }
    const availability = creatable(create, holidays, failedRemovals);
    if (availability === "removalFailed") continue;
    if (availability === "holidaysUnavailable") {
      addAction(
        ctx,
        "failed",
        create.date,
        create.kind,
        "Feiertage nicht abrufbar – Tag wird beim nächsten Lauf eingetragen.",
      );
      continue;
    }

    const writeTiming =
      create.toTiming && timing.client !== null && timing.projectRef !== null;
    if (!writeTiming) {
      // Hinweis, wenn der Tag eigentlich nach Timing gehört hätte
      const hint =
        writesToTiming(create.kind) && timing.skippedReason
          ? ` Nicht in Timing: ${timing.skippedReason}`
          : "";
      await createLocalOnly(create, hint);
      continue;
    }

    const key = createKey(create);
    const outcome = work.outcomes.get(key);
    if (!outcome) {
      addAction(
        ctx,
        "failed",
        create.date,
        create.kind,
        "Tag erst während des Abgleichs hinzugekommen – wird beim nächsten Lauf eingetragen.",
      );
      continue;
    }
    if (outcome.type === "failed") {
      addAction(ctx, "failed", create.date, create.kind, outcome.detail);
      continue;
    }
    if (outcome.type === "occupied") {
      await createLocalOnly(create, occupiedHint);
      continue;
    }
    if (outcome.type === "notYet") {
      await createLocalOnly(create, notYetHint);
      continue;
    }
    if (await externalIdInUse(outcome.entry.self)) {
      // Inzwischen lokal zugeordnet (z. B. Timing-Sync): nicht doppelt
      // speichern; ein eben angelegter Eintrag wird danach wieder gelöscht
      await createLocalOnly(create, occupiedHint);
      continue;
    }
    consumed.add(key);

    if (outcome.type === "linkForeign") {
      await tx.timeEntry.create({
        data: {
          userId,
          ...toSyncEntryRow(outcome.data),
          // Typ wie geplant (der Timing-Sync ermittelt denselben)
          type: create.entryType,
          absenceId: create.absenceId,
        },
      });
      addAction(
        ctx,
        "linked",
        create.date,
        create.kind,
        "Vorhandenen Timing-Eintrag verknüpft – er bleibt in Timing unangetastet.",
      );
      continue;
    }

    const adopted = outcome.type === "adoptOwn";
    await tx.timeEntry.create({
      data: ownEntryData(userId, create, {
        externalId: outcome.entry.self,
        entry: outcome.entry,
        adopted,
      }),
    });
    addAction(
      ctx,
      adopted ? "timingAdopted" : "timingCreated",
      create.date,
      create.kind,
      adopted
        ? "Eigenen Timing-Eintrag übernommen."
        : `${label(create.kind)}${create.halfDay ? " (halber Tag)" : ""} in Timing eingetragen.`,
    );
  }

  const orphans: Orphan[] = [];
  for (const [key, outcome] of work.outcomes) {
    if (outcome.type !== "created" || consumed.has(key)) continue;
    // Inzwischen lokal zugeordnet (z. B. vom Timing-Sync importiert und eben
    // verknüpft): nicht in Timing löschen
    if (await externalIdInUse(outcome.entry.self)) continue;
    orphans.push({ entry: outcome.entry, create: outcome.create });
  }
  return orphans;
}

/**
 * In Timing angelegte Einträge, die nach Transaktion 2 niemand braucht (Tag
 * inzwischen anders belegt), wieder löschen – sonst kämen sie später über
 * den Timing-Sync als Duplikat zurück.
 */
async function removeOrphans(
  ctx: RunContext,
  orphans: readonly Orphan[],
): Promise<void> {
  const client = ctx.timing.client;
  if (!client) return;
  for (const { entry, create } of orphans) {
    const { date, kind } = create;
    try {
      await client.deleteTimeEntry(entry.self);
      addAction(
        ctx,
        "deleted",
        date,
        kind,
        "In Timing angelegten Eintrag wieder entfernt – der Tag ist inzwischen anders belegt.",
      );
    } catch (error) {
      addAction(
        ctx,
        "failed",
        date,
        kind,
        `Überzähligen Timing-Eintrag nicht gelöscht (${timingErrorText(error)}) – bitte in Timing von Hand löschen.`,
      );
    }
  }
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
    const feedActions: CalendarSyncAction[] = [];
    const dayActions: CalendarSyncAction[] = [];
    let feedUrl: string | undefined;
    let absencesSynced = false;
    let result: CalendarSyncResult;

    try {
      try {
        feedUrl = decryptSecret(integration.feedUrlEnc);
      } catch {
        throw new CalendarSyncError(
          "Die Feed-URL ist nicht lesbar – bitte neu hinterlegen.",
        );
      }

      // 1. Erst laden und auswerten – scheitert das, wird nichts geändert
      const feed = parseTimewarpFeed(
        await fetchCalendarFeed(feedUrl, { fetchImpl: options.feedFetchImpl }),
      );
      Object.assign(stats, summarizeFeed(feed));
      for (const unknown of feed.unknown) {
        feedActions.push({
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
      const ctx: RunContext = {
        userId,
        now,
        timing,
        actions: dayActions,
        stats,
      };

      // 2. Absence-Zeilen (kurze Transaktion unter der Sperre)
      const absencePlan = await prisma.$transaction(
        (tx) => syncAbsences(tx, ctx, feed),
        TRANSACTION_OPTIONS,
      );
      absencesSynced = true;
      stats.absencesCreated = absencePlan.create.length;
      stats.absencesUpdated = absencePlan.update.length;
      stats.absencesCancelled =
        absencePlan.cancelMissing.length +
        absencePlan.update.filter((u) => u.data.status === "CANCELLED").length;

      // 3. Planen und Timing – ohne Transaktion
      const feedUids = feed.absences.map((a) => a.uid);
      const state = await loadDayState(prisma, userId, feedUids);
      if (state.absences.length > 0) {
        const holidays = await loadHolidaysFor(state.absences, now);
        const work = await runTimingCalls(
          ctx,
          planFor(state, holidays, schedule, timing),
          holidays,
          schedule.dailyHours,
        );

        // 4. Frisch planen und anwenden (kurze Transaktion unter der Sperre)
        const orphans = await prisma.$transaction(
          (tx) => applyDays(tx, ctx, feedUids, holidays, schedule, work),
          TRANSACTION_OPTIONS,
        );
        await removeOrphans(ctx, orphans);
      }
      result = {
        status: CALENDAR_SYNC_STATUS_SUCCESS,
        stats,
        actions: [...feedActions, ...dayActions],
      };
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
      // Die Tage sind verworfen (Transaktion 2 zurückgerollt oder nie
      // gelaufen); die Absence-Zeilen aus Transaktion 1 bleiben, wenn sie
      // schon gespeichert waren. Im Protokoll stehen nur die Feed-Meldungen.
      for (const counter of DAY_COUNTERS) stats[counter] = 0;
      if (!absencesSynced) {
        stats.absencesCreated = 0;
        stats.absencesUpdated = 0;
        stats.absencesCancelled = 0;
      }
      result = {
        status: CALENDAR_SYNC_STATUS_ERROR,
        error: sanitizeCalendarError(error, [feedUrl]),
        stats,
        actions: feedActions,
      };
    }

    result.stats.durationMs = Date.now() - startedAt.getTime();
    if (result.status === CALENDAR_SYNC_STATUS_SUCCESS || absencesSynced) {
      overtimeService.invalidateCache(userId);
    }
    await writeLogAndStatus(userId, result, startedAt);
    return result;
  } finally {
    runningSyncs.delete(userId);
  }
}
