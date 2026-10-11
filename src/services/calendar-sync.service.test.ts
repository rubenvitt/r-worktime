import { beforeEach, describe, expect, it, vi } from "vitest";

// In-Memory-Datenbank mit den Abfrageformen, die der Abgleich nutzt.
// Transaktionen arbeiten auf einer Kopie und verwerfen sie bei einem Fehler
// (wie Postgres), damit „Wiederholung ohne Duplikat“ echt geprüft wird.
const { db, prismaMock, invalidateCache, failNextEntryCreate, txState } =
  vi.hoisted(() => {
    process.env.TIMING_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      "base64",
    );
    type Row = Record<string, unknown>;
    const db = {
      absences: [] as Row[],
      entries: [] as Row[],
      logs: [] as Row[],
      integration: null as Row | null,
      timingIntegration: null as Row | null,
      nextId: 1,
    };
    const failNextEntryCreate = { value: false };
    /** Läuft gerade eine Transaktion (= wird die Abwesenheits-Sperre gehalten)? */
    const txState = { active: false };

    const isPlainObject = (v: unknown): v is Record<string, unknown> =>
      typeof v === "object" &&
      v !== null &&
      !(v instanceof Date) &&
      !Array.isArray(v);
    const same = (a: unknown, b: unknown) =>
      a instanceof Date && b instanceof Date
        ? a.getTime() === b.getTime()
        : a === b;

    function matches(row: Row, where: Record<string, unknown> = {}): boolean {
      return Object.entries(where).every(([key, cond]) => {
        if (key === "OR") {
          return (cond as Record<string, unknown>[]).some((c) =>
            matches(row, c),
          );
        }
        const value = row[key];
        if (isPlainObject(cond)) {
          if (
            "in" in cond &&
            !(cond.in as unknown[]).some((v) => same(v, value))
          )
            return false;
          if ("not" in cond && same(cond.not, value ?? null)) return false;
          if ("gte" in cond && (value as Date) < (cond.gte as Date))
            return false;
          if ("lte" in cond && (value as Date) > (cond.lte as Date))
            return false;
          return true;
        }
        return same(value ?? null, cond);
      });
    }

    function pick(row: Row, select?: Record<string, boolean>): Row {
      if (!select) return { ...row };
      return Object.fromEntries(
        Object.keys(select).map((key) => [key, row[key]]),
      );
    }

    function table(
      get: () => Row[],
      set: (rows: Row[]) => void,
      defaults: () => Row,
    ) {
      return {
        findMany: vi.fn(
          async (
            args: {
              where?: Record<string, unknown>;
              select?: Record<string, boolean>;
              orderBy?: Record<string, "asc" | "desc">;
              skip?: number;
            } = {},
          ) => {
            let rows = get().filter((row) => matches(row, args.where));
            if (args.orderBy) {
              const [[key, dir]] = Object.entries(args.orderBy);
              rows = [...rows].sort((a, b) => {
                const diff =
                  (a[key] as Date).getTime() - (b[key] as Date).getTime();
                return dir === "desc" ? -diff : diff;
              });
            }
            return rows
              .slice(args.skip ?? 0)
              .map((row) => pick(row, args.select));
          },
        ),
        findFirst: vi.fn(
          async (args: {
            where?: Record<string, unknown>;
            select?: Record<string, boolean>;
          }) => {
            const row = get().find((r) => matches(r, args.where));
            return row ? pick(row, args.select) : null;
          },
        ),
        create: vi.fn(
          async (args: { data: Row; select?: Record<string, boolean> }) => {
            const row: Row = {
              id: `id-${db.nextId++}`,
              ...defaults(),
              ...args.data,
            };
            if (
              row.externalId &&
              get().some(
                (r) =>
                  r.userId === row.userId && r.externalId === row.externalId,
              )
            ) {
              throw new Error("Unique constraint failed on externalId");
            }
            set([...get(), row]);
            return pick(row, args.select);
          },
        ),
        update: vi.fn(async (args: { where: { id: string }; data: Row }) => {
          const row = get().find((r) => r.id === args.where.id);
          if (!row) throw new Error("Record to update not found");
          Object.assign(row, args.data);
          return { ...row };
        }),
        updateMany: vi.fn(
          async (args: { where: Record<string, unknown>; data: Row }) => {
            const rows = get().filter((r) => matches(r, args.where));
            for (const row of rows) Object.assign(row, args.data);
            return { count: rows.length };
          },
        ),
        deleteMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
          const before = get().length;
          set(get().filter((r) => !matches(r, args.where)));
          return { count: before - get().length };
        }),
      };
    }

    const absence = table(
      () => db.absences,
      (rows) => {
        db.absences = rows;
      },
      () => ({ suppressedDates: [], createdAt: new Date() }),
    );
    const timeEntry = table(
      () => db.entries,
      (rows) => {
        db.entries = rows;
      },
      () => ({ externalId: null, absenceId: null }),
    );
    const realEntryCreate = timeEntry.create.getMockImplementation();
    timeEntry.create.mockImplementation(async (args) => {
      if (failNextEntryCreate.value) {
        failNextEntryCreate.value = false;
        throw new Error("Verbindung zur Datenbank verloren");
      }
      if (!realEntryCreate) throw new Error("create fehlt");
      return realEntryCreate(args);
    });
    const absenceSyncLog = table(
      () => db.logs,
      (rows) => {
        db.logs = rows;
      },
      () => ({}),
    );

    const tx = {
      $queryRaw: vi.fn(async () => [{ locked: 1 }]),
      absence,
      timeEntry,
    };
    const prismaMock = {
      calendarIntegration: {
        findUnique: vi.fn(async () =>
          db.integration ? { ...db.integration } : null,
        ),
        update: vi.fn(async (args: { data: Row }) => {
          Object.assign(db.integration ?? {}, args.data);
          return db.integration;
        }),
      },
      timingIntegration: {
        findUnique: vi.fn(async () => db.timingIntegration),
      },
      absence,
      timeEntry,
      absenceSyncLog,
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        const snapshot = structuredClone({
          absences: db.absences,
          entries: db.entries,
        });
        txState.active = true;
        try {
          return await fn(tx);
        } catch (error) {
          db.absences = snapshot.absences;
          db.entries = snapshot.entries;
          throw error;
        } finally {
          txState.active = false;
        }
      }),
    };
    return {
      db,
      prismaMock,
      invalidateCache: vi.fn(),
      failNextEntryCreate,
      txState,
    };
  });

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/services/overtime.service", () => ({
  overtimeService: { invalidateCache },
}));
vi.mock("@/services/holiday.service", () => ({
  loadOfficialHolidays: vi.fn(async () => ({
    names: {
      "2026-12-25": "1. Weihnachtstag",
      "2026-12-26": "2. Weihnachtstag",
    },
    unavailableYears: [],
  })),
}));
vi.mock("@/services/settings.service", () => ({
  getUserSettings: vi.fn(async () => ({
    weeklyWorkHours: 40,
    workDays: [1, 2, 3, 4, 5],
  })),
}));

import { encryptSecret } from "@/lib/crypto";
import {
  TimingApiError,
  type TimingApiTimeEntry,
  type TimingClient,
} from "@/lib/timing/client";
import {
  CalendarNotConfiguredError,
  CalendarSyncInProgressError,
  isCalendarSyncRunning,
  syncCalendarForUser,
} from "./calendar-sync.service";

const USER = "user-1";
const FEED_TOKEN = "feed-token-xyz";
const FEED_URL = `https://timewarp.innoq.io/export/${FEED_TOKEN}/calendar.ics`;
// Alle Urlaubstage der Fixtures haben begonnen – Timing nimmt nur solche an
const NOW = new Date("2026-12-23T12:00:00.000Z");
// Vor den Urlaubstagen: für künftige Abwesenheiten
const BEFORE = new Date("2026-10-11T10:00:00.000Z");
const PROJECT = "/projects/42";

function vevent(lines: string[]): string {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
}

function feed(...events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//timewarp//DE",
    "METHOD:CANCEL",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

// Mo 21. bis Mi 23.12.2026
const VACATION = vevent([
  "UID:abs-100",
  "SEQUENCE:1",
  "DTSTART;VALUE=DATE:20261221",
  "DTEND;VALUE=DATE:20261224",
  "SUMMARY:Max Muster: URLAUB",
]);
const VACATION_CANCELLED = vevent([
  "UID:abs-100",
  "SEQUENCE:2",
  "STATUS:CANCELLED",
  "DTSTART;VALUE=DATE:20261221",
  "DTEND;VALUE=DATE:20261224",
  "SUMMARY:Max Muster: URLAUB",
]);
const EVENT = vevent([
  "UID:ev-1",
  "DTSTART;VALUE=DATE:20261105",
  "DTEND;VALUE=DATE:20261105",
  "SUMMARY:Max Muster: Event in Köln",
]);
const UNKNOWN = vevent([
  "UID:abs-200",
  "DTSTART;VALUE=DATE:20270301",
  "DTEND;VALUE=DATE:20270302",
  "SUMMARY:Max Muster: WORKATION",
]);

function feedFetch(body: string, status = 200) {
  return vi.fn(
    async () => new Response(body, { status }),
  ) as unknown as typeof fetch;
}

/** Timing-Aufrufe unter der Sperre wären ein Fehler (Dialog müsste warten) */
const timingCalls = { total: 0, inTransaction: 0 };
function assertNoTransaction() {
  timingCalls.total++;
  if (txState.active) {
    timingCalls.inTransaction++;
    throw new Error("Timing-Aufruf während einer Transaktion");
  }
}

/** Timing als In-Memory-Fake; lehnt wie Timing Einträge in der Zukunft ab */
function fakeTiming(clock: Date = NOW) {
  const entries: TimingApiTimeEntry[] = [];
  let next = 1000;
  const failCreates = { count: 0 };
  const client: TimingClient & {
    entries: TimingApiTimeEntry[];
    failCreates: typeof failCreates;
    clock: Date;
  } = {
    entries,
    failCreates,
    clock,
    listTimeEntries: vi.fn(async (range) => {
      assertNoTransaction();
      return entries.filter((e) => {
        const key = e.start_date.slice(0, 10);
        return key >= range.from && key <= range.to;
      });
    }),
    createTimeEntry: vi.fn(async (input) => {
      assertNoTransaction();
      if (input.start.getTime() > client.clock.getTime()) {
        throw new TimingApiError(
          "HTTP_ERROR",
          "Timing-API antwortet mit HTTP 422: The start date must not lie in the future.",
          422,
        );
      }
      if (failCreates.count > 0) {
        failCreates.count--;
        throw new TimingApiError(
          "HTTP_ERROR",
          "Timing-API antwortet mit HTTP 500.",
          500,
        );
      }
      const entry: TimingApiTimeEntry = {
        self: `/time-entries/${next++}`,
        start_date: input.start.toISOString(),
        end_date: input.end.toISOString(),
        duration: (input.end.getTime() - input.start.getTime()) / 1000,
        project: {
          self: input.projectRef,
          title_chain: ["Work", "INNOQ", "Urlaub"],
        },
        title: input.title,
        notes: input.notes ?? null,
        is_running: false,
      };
      entries.push(entry);
      return entry;
    }),
    deleteTimeEntry: vi.fn(async (self) => {
      assertNoTransaction();
      const index = entries.findIndex((e) => e.self === self);
      if (index >= 0) entries.splice(index, 1);
    }),
    listProjects: vi.fn(async () => []),
    testConnection: vi.fn(async () => ({ projectCount: 0 })),
  };
  return client;
}

function run(
  ics: string,
  timingClient?: TimingClient,
  trigger: "manual" | "scheduler" = "manual",
  now: Date = NOW,
) {
  return syncCalendarForUser(USER, {
    trigger,
    now,
    feedFetchImpl: feedFetch(ics),
    timingClient,
  });
}

const timewarpEntries = () => db.entries.filter((e) => e.source === "TIMEWARP");

beforeEach(() => {
  vi.clearAllMocks();
  db.absences = [];
  db.entries = [];
  db.logs = [];
  db.nextId = 1;
  failNextEntryCreate.value = false;
  txState.active = false;
  timingCalls.total = 0;
  timingCalls.inTransaction = 0;
  db.integration = {
    id: "cal-1",
    userId: USER,
    feedUrlEnc: encryptSecret(FEED_URL),
    syncEnabled: true,
    writeToTiming: true,
    timingProjectId: PROJECT,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    lastSyncStats: null,
  };
  db.timingIntegration = null;
});

describe("syncCalendarForUser – Grundlauf", () => {
  it("legt Abwesenheit, Tage und Timing-Einträge an und protokolliert", async () => {
    const timing = fakeTiming();
    const result = await run(feed(VACATION, EVENT, UNKNOWN), timing);

    expect(result.status).toBe("success");
    expect(result.stats).toMatchObject({
      absences: 1,
      cancelled: 0,
      events: 1,
      unknownTypes: ["WORKATION"],
      absencesCreated: 1,
      timingCreated: 3,
      created: 0,
      failed: 0,
    });
    expect(result.actions.map((a) => [a.date, a.action])).toEqual([
      ["2027-03-01", "skippedUnknownType"],
      ["2026-12-21", "timingCreated"],
      ["2026-12-22", "timingCreated"],
      ["2026-12-23", "timingCreated"],
    ]);

    expect(db.absences).toHaveLength(1);
    expect(db.absences[0]).toMatchObject({
      source: "TIMEWARP",
      externalUid: "abs-100",
      kind: "VACATION",
      status: "ACTIVE",
      sequence: 1,
      lastSeenAt: NOW,
    });

    expect(timing.entries).toHaveLength(3);
    expect(timing.createTimeEntry).toHaveBeenCalledWith({
      start: new Date("2026-12-21T07:00:00.000Z"),
      end: new Date("2026-12-21T15:00:00.000Z"),
      projectRef: PROJECT,
      title: "Urlaub",
      notes: "Aus Timewarp",
      billingStatus: "not_billable",
    });
    // Suche vorher einmal über den ganzen Zeitraum im Projekt
    expect(timing.listTimeEntries).toHaveBeenCalledTimes(1);
    expect(timing.listTimeEntries).toHaveBeenCalledWith(
      { from: "2026-12-21", to: "2026-12-23" },
      { projects: [PROJECT], includeChildProjects: true },
    );

    expect(timewarpEntries()).toHaveLength(3);
    expect(timewarpEntries()[0]).toMatchObject({
      type: "VACATION",
      duration: 8,
      title: "Urlaub",
      notes: "Aus Timewarp",
      description: "Urlaub - Aus Timewarp",
      projectPath: "Work ▸ INNOQ ▸ Urlaub",
      billingStatus: "not_billable",
      absenceId: db.absences[0].id,
      externalId: timing.entries[0].self,
    });

    expect(db.logs).toHaveLength(1);
    expect(db.logs[0]).toMatchObject({ status: "success", error: null });
    expect(db.integration).toMatchObject({
      lastSyncStatus: "success",
      lastSyncError: null,
    });
    expect((db.integration?.lastSyncAt as Date) instanceof Date).toBe(true);
    expect(invalidateCache).toHaveBeenCalledWith(USER);
    // Zwei kurze Transaktionen (Abwesenheiten, Tage), Timing dazwischen
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(isCalendarSyncRunning(USER)).toBe(false);
  });

  it("ist wiederholbar: zweiter Lauf ändert nichts", async () => {
    const timing = fakeTiming();
    await run(feed(VACATION), timing);
    const second = await run(feed(VACATION), timing);

    expect(second.status).toBe("success");
    expect(second.actions).toEqual([]);
    expect(timing.entries).toHaveLength(3);
    expect(timewarpEntries()).toHaveLength(3);
    expect(timing.createTimeEntry).toHaveBeenCalledTimes(3);
  });

  it("verknüpft vorhandene Urlaubseinträge aus dem Timing-Sync statt neu anzulegen", async () => {
    db.entries.push({
      id: "sync-1",
      userId: USER,
      date: new Date("2026-12-22T00:00:00.000Z"),
      type: "VACATION",
      source: "TIMING_SYNC",
      externalId: "/time-entries/500",
      absenceId: null,
      duration: 8,
    });
    const timing = fakeTiming();
    const result = await run(feed(VACATION), timing);

    expect(result.actions.map((a) => [a.date, a.action])).toEqual([
      ["2026-12-22", "linked"],
      ["2026-12-21", "timingCreated"],
      ["2026-12-23", "timingCreated"],
    ]);
    expect(db.entries.find((e) => e.id === "sync-1")?.absenceId).toBe(
      db.absences[0].id,
    );
    expect(timing.entries).toHaveLength(2);
  });

  it("verknüpft einen fremden Urlaubseintrag in Timing nur (wie der Timing-Sync), statt ihn doppelt anzulegen", async () => {
    const timing = fakeTiming();
    timing.entries.push({
      self: "/time-entries/77",
      start_date: "2026-12-21T07:00:00.000Z",
      end_date: "2026-12-21T15:00:00.000Z",
      duration: 28_800,
      project: { self: PROJECT, title_chain: ["Work", "INNOQ", "Urlaub"] },
      title: "Weihnachtsurlaub",
      notes: null,
      billing_status: "not_billable",
      is_running: false,
    });
    const result = await run(feed(VACATION), timing);

    expect(result.actions[0]).toMatchObject({
      date: "2026-12-21",
      action: "linked",
    });
    expect(result.stats).toMatchObject({ linked: 1, timingCreated: 2 });
    expect(timing.entries).toHaveLength(3);
    expect(
      db.entries.find((e) => e.externalId === "/time-entries/77"),
    ).toMatchObject({
      source: "TIMING_SYNC",
      type: "VACATION",
      absenceId: db.absences[0].id,
      title: "Weihnachtsurlaub",
      description: "Weihnachtsurlaub",
      projectPath: "Work ▸ INNOQ ▸ Urlaub",
      duration: 8,
    });
  });

  it("übernimmt einen eigenen Timing-Eintrag (Notiz „Aus Timewarp“) als TIMEWARP", async () => {
    const timing = fakeTiming();
    timing.entries.push({
      self: "/time-entries/78",
      start_date: "2026-12-21T07:00:00.000Z",
      end_date: "2026-12-21T15:00:00.000Z",
      duration: 28_800,
      project: { self: PROJECT, title_chain: ["Work", "INNOQ", "Urlaub"] },
      title: "Urlaub",
      notes: "Aus Timewarp",
      is_running: false,
    });
    const result = await run(feed(VACATION), timing);

    expect(result.actions[0]).toMatchObject({
      date: "2026-12-21",
      action: "timingAdopted",
    });
    expect(
      db.entries.find((e) => e.externalId === "/time-entries/78"),
    ).toMatchObject({ source: "TIMEWARP", absenceId: db.absences[0].id });
    expect(timing.entries).toHaveLength(3);
  });
});

describe("syncCalendarForUser – fremde Timing-Einträge und Sperre", () => {
  function foreignVacation(self: string, day: string) {
    return {
      self,
      start_date: `${day}T07:00:00.000Z`,
      end_date: `${day}T15:00:00.000Z`,
      duration: 28_800,
      project: { self: PROJECT, title_chain: ["Work", "INNOQ", "Urlaub"] },
      title: "Osterurlaub",
      notes: "von Hand",
      is_running: false,
    } satisfies TimingApiTimeEntry;
  }

  it("Storno entkoppelt einen verknüpften fremden Timing-Eintrag und löscht ihn nie in Timing", async () => {
    const timing = fakeTiming();
    timing.entries.push(foreignVacation("/time-entries/90", "2026-12-22"));
    await run(feed(VACATION), timing);
    expect(
      db.entries.find((e) => e.externalId === "/time-entries/90"),
    ).toMatchObject({ source: "TIMING_SYNC", absenceId: db.absences[0].id });

    const result = await run(feed(VACATION_CANCELLED), timing);
    expect(result.stats).toMatchObject({ deleted: 2, unlinked: 1 });
    expect(timing.deleteTimeEntry).toHaveBeenCalledTimes(2);
    expect(timing.deleteTimeEntry).not.toHaveBeenCalledWith("/time-entries/90");
    expect(timing.entries.map((e) => e.self)).toEqual(["/time-entries/90"]);
    expect(
      db.entries.find((e) => e.externalId === "/time-entries/90"),
    ).toMatchObject({ source: "TIMING_SYNC", absenceId: null });
  });

  it("ruft Timing nie innerhalb einer Transaktion auf", async () => {
    const timing = fakeTiming();
    await run(feed(VACATION), timing);
    await run(feed(VACATION_CANCELLED), timing);
    expect(timingCalls.total).toBeGreaterThan(0);
    expect(timingCalls.inTransaction).toBe(0);
  });

  it("Tag wird während der Timing-Aufrufe per Dialog belegt: kein Duplikat, Timing-Eintrag wieder gelöscht", async () => {
    const timing = fakeTiming();
    const create = vi.mocked(timing.createTimeEntry);
    const impl = create.getMockImplementation();
    create.mockImplementation(async (input) => {
      const result = await (impl as NonNullable<typeof impl>)(input);
      if (input.start.toISOString().startsWith("2026-12-22")) {
        // Parallel: Dialog „Abwesenheit eintragen“ legt den 22. an
        db.absences.push({
          id: "manual-abs",
          userId: USER,
          source: "MANUAL",
          externalUid: null,
          kind: "VACATION",
          startDate: new Date("2026-12-22T00:00:00.000Z"),
          endDate: new Date("2026-12-22T00:00:00.000Z"),
          halfDay: false,
          status: "ACTIVE",
          suppressedDates: [],
        });
        db.entries.push({
          id: "dialog-1",
          userId: USER,
          date: new Date("2026-12-22T00:00:00.000Z"),
          type: "VACATION",
          source: "MANUAL",
          externalId: null,
          absenceId: "manual-abs",
          duration: 8,
        });
      }
      return result;
    });

    const result = await run(feed(VACATION), timing);
    expect(result.status).toBe("success");
    expect(result.stats).toMatchObject({ timingCreated: 2, deleted: 1 });
    expect(result.actions.at(-1)).toMatchObject({
      date: "2026-12-22",
      kind: "VACATION",
      action: "deleted",
    });
    // Am 22. nur der Dialog-Eintrag, in Timing nichts
    const on22 = db.entries.filter(
      (e) => (e.date as Date).toISOString().slice(0, 10) === "2026-12-22",
    );
    expect(on22.map((e) => e.id)).toEqual(["dialog-1"]);
    expect(
      timing.entries.filter((e) => e.start_date.startsWith("2026-12-22")),
    ).toHaveLength(0);
    expect(timing.entries).toHaveLength(2);

    // Nächster Lauf: nichts mehr zu tun
    const second = await run(feed(VACATION), timing);
    expect(second.actions).toEqual([]);
  });
});

describe("syncCalendarForUser – keine Duplikate in Timing", () => {
  it("legt keinen zweiten Timing-Eintrag an, wenn der vorhandene lokal schon zugeordnet ist", async () => {
    const timing = fakeTiming();
    timing.entries.push({
      self: "/time-entries/88",
      start_date: "2026-12-21T07:00:00.000Z",
      end_date: "2026-12-21T15:00:00.000Z",
      duration: 28_800,
      project: { self: PROJECT, title_chain: ["Work", "INNOQ", "Urlaub"] },
      title: "Urlaub",
      notes: null,
      is_running: false,
    });
    // Lokal hängt die Timing-ID an einem anderen Eintrag (anderer Typ)
    db.entries.push({
      id: "other",
      userId: USER,
      date: new Date("2026-12-21T00:00:00.000Z"),
      type: "WORK",
      source: "MANUAL",
      externalId: "/time-entries/88",
      absenceId: null,
      duration: 8,
    });
    const result = await run(feed(VACATION), timing);

    expect(result.actions[0]).toMatchObject({
      date: "2026-12-21",
      action: "created",
      detail: expect.stringContaining("Nicht in Timing"),
    });
    expect(timing.entries).toHaveLength(3);
    expect(
      timing.entries.filter((e) => e.start_date.startsWith("2026-12-21")),
    ).toHaveLength(1);
  });
});

describe("syncCalendarForUser – passende Übernahme und Artwechsel", () => {
  it("verknüpft einen fremden halben Timing-Eintrag auch für einen ganzen Tag und lässt ihn danach in Ruhe", async () => {
    const timing = fakeTiming();
    timing.entries.push({
      self: "/time-entries/66",
      start_date: "2026-12-21T07:00:00.000Z",
      end_date: "2026-12-21T11:00:00.000Z",
      duration: 14_400,
      project: { self: PROJECT, title_chain: ["Work", "INNOQ", "Urlaub"] },
      title: "Urlaub",
      notes: null,
      is_running: false,
    });
    const first = await run(feed(VACATION), timing);
    expect(first.actions[0]).toMatchObject({
      date: "2026-12-21",
      action: "linked",
    });
    expect(timing.entries).toHaveLength(3);

    // Zweiter Lauf: nichts wird gelöscht oder ersetzt
    const second = await run(feed(VACATION), timing);
    expect(second.actions).toEqual([]);
    expect(timing.entries.map((e) => e.self)).toContain("/time-entries/66");
  });

  it("Artwechsel Urlaub → Überstundenabbau löscht die Timing-Einträge", async () => {
    const timing = fakeTiming();
    await run(feed(VACATION), timing);
    const reduction = VACATION.replace("SEQUENCE:1", "SEQUENCE:2").replace(
      "URLAUB",
      "ÜBERSTUNDENABBAU",
    );
    const result = await run(feed(reduction), timing);

    expect(result.stats).toMatchObject({
      absencesUpdated: 1,
      deleted: 3,
      created: 3,
    });
    expect(timing.entries).toHaveLength(0);
    expect(timewarpEntries().map((e) => e.type)).toEqual([
      "OVERTIME_REDUCTION",
      "OVERTIME_REDUCTION",
      "OVERTIME_REDUCTION",
    ]);
    expect(timewarpEntries().every((e) => e.externalId === null)).toBe(true);
  });
});

describe("syncCalendarForUser – Fehler und Wiederholung", () => {
  it("Fehler beim Anlegen in Timing: Tag bleibt leer, nächster Lauf holt ihn nach – ohne Duplikat", async () => {
    const timing = fakeTiming();
    timing.failCreates.count = 1;
    const first = await run(feed(VACATION), timing);

    expect(first.status).toBe("success");
    expect(first.stats).toMatchObject({ timingCreated: 2, failed: 1 });
    expect(first.actions[0]).toMatchObject({
      date: "2026-12-21",
      action: "failed",
      detail: expect.stringContaining("HTTP 500"),
    });
    expect(timewarpEntries()).toHaveLength(2);
    expect(db.integration?.lastSyncError).toMatch(/1 Aktion/);

    const second = await run(feed(VACATION), timing);
    expect(second.actions.map((a) => [a.date, a.action])).toEqual([
      ["2026-12-21", "timingCreated"],
    ]);
    expect(timing.entries).toHaveLength(3);
    expect(timewarpEntries()).toHaveLength(3);
    expect(new Set(timewarpEntries().map((e) => e.externalId)).size).toBe(3);
  });

  it("Speichern scheitert nach dem Anlegen in Timing: nächster Lauf übernimmt die eigenen Timing-Einträge", async () => {
    const timing = fakeTiming();
    failNextEntryCreate.value = true;
    const first = await run(feed(VACATION), timing);

    expect(first.status).toBe("error");
    expect(first.error).toBe("Der Kalender-Abgleich ist fehlgeschlagen.");
    expect(first.actions).toEqual([]);
    // Abwesenheit aus Transaktion 1 bleibt, Tage verworfen, Timing-Einträge da
    expect(first.stats).toMatchObject({ absencesCreated: 1, timingCreated: 0 });
    expect(db.absences).toHaveLength(1);
    expect(db.entries).toHaveLength(0);
    expect(timing.entries).toHaveLength(3);
    expect(db.integration?.lastSyncStatus).toBe("error");

    const second = await run(feed(VACATION), timing);
    expect(second.status).toBe("success");
    expect(second.actions.map((a) => [a.date, a.action])).toEqual([
      ["2026-12-21", "timingAdopted"],
      ["2026-12-22", "timingAdopted"],
      ["2026-12-23", "timingAdopted"],
    ]);
    expect(timing.createTimeEntry).toHaveBeenCalledTimes(3);
    expect(timing.entries).toHaveLength(3);
    expect(timewarpEntries()).toHaveLength(3);
  });

  it("Feed nicht abrufbar: Status error ohne URL/Token, nichts geändert", async () => {
    const timing = fakeTiming();
    const result = await syncCalendarForUser(USER, {
      trigger: "scheduler",
      now: NOW,
      feedFetchImpl: feedFetch("kaputt", 500),
      timingClient: timing,
    });

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/HTTP 500/);
    expect(result.error).not.toContain(FEED_TOKEN);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(db.logs[0]).toMatchObject({ status: "error" });
    expect(String(db.logs[0].error)).not.toContain(FEED_TOKEN);
    expect(db.integration?.lastSyncStatus).toBe("error");
    expect(db.integration?.lastSyncAt).toBeInstanceOf(Date);
  });

  it("leerer Feed bei künftigen Abwesenheiten: Abbruch statt Massen-Storno", async () => {
    const timing = fakeTiming(BEFORE);
    await run(feed(VACATION), timing, "manual", BEFORE);
    const result = await run(feed(), timing, "manual", BEFORE);

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/keine Termine/);
    expect(db.absences[0].status).toBe("ACTIVE");
    expect(timewarpEntries()).toHaveLength(3);
  });

  it("lässt pro Nutzer nur einen Lauf gleichzeitig zu", async () => {
    let release: (r: Response) => void = () => {};
    const slowFetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ) as unknown as typeof fetch;
    const first = syncCalendarForUser(USER, {
      trigger: "manual",
      now: NOW,
      feedFetchImpl: slowFetch,
      timingClient: fakeTiming(),
    });
    await vi.waitFor(() => expect(slowFetch).toHaveBeenCalled());
    expect(isCalendarSyncRunning(USER)).toBe(true);
    await expect(run(feed(VACATION), fakeTiming())).rejects.toBeInstanceOf(
      CalendarSyncInProgressError,
    );
    release(new Response(feed(VACATION), { status: 200 }));
    await first;
    expect(isCalendarSyncRunning(USER)).toBe(false);
  });

  it("meldet eine fehlende Feed-URL", async () => {
    db.integration = { ...db.integration, feedUrlEnc: null };
    await expect(run(feed(VACATION))).rejects.toBeInstanceOf(
      CalendarNotConfiguredError,
    );
    expect(isCalendarSyncRunning(USER)).toBe(false);
  });
});

describe("syncCalendarForUser – künftige Tage", () => {
  it("trägt künftige Tage nur lokal ein, ohne Timing zu fragen", async () => {
    const timing = fakeTiming(BEFORE);
    const result = await run(feed(VACATION), timing, "manual", BEFORE);

    expect(result.status).toBe("success");
    expect(result.stats).toMatchObject({
      created: 3,
      timingCreated: 0,
      failed: 0,
    });
    expect(result.actions.map((a) => [a.date, a.action])).toEqual([
      ["2026-12-21", "created"],
      ["2026-12-22", "created"],
      ["2026-12-23", "created"],
    ]);
    expect(result.actions[0].detail).toMatch(/sobald er begonnen hat/);
    expect(timing.createTimeEntry).not.toHaveBeenCalled();
    expect(timing.listTimeEntries).not.toHaveBeenCalled();
    expect(timewarpEntries().map((e) => e.externalId)).toEqual([
      null,
      null,
      null,
    ]);

    // Weitere Läufe vor den Tagen bleiben still
    const again = await run(feed(VACATION), timing, "manual", BEFORE);
    expect(again.actions).toEqual([]);
    expect(timing.createTimeEntry).not.toHaveBeenCalled();
  });

  it("trägt jeden Tag nach Timing nach, sobald er begonnen hat – ohne Duplikat", async () => {
    await run(feed(VACATION), fakeTiming(BEFORE), "manual", BEFORE);

    // Mo 22.12., 11:00 Uhr: 21. und 22. haben begonnen, der 23. nicht
    const monday = new Date("2026-12-22T10:00:00.000Z");
    const timing = fakeTiming(monday);
    const first = await run(feed(VACATION), timing, "scheduler", monday);
    expect(first.status).toBe("success");
    expect(first.actions.map((a) => [a.date, a.action])).toEqual([
      ["2026-12-21", "timingCreated"],
      ["2026-12-22", "timingCreated"],
    ]);
    expect(first.actions[0].detail).toMatch(/nachgetragen/);
    expect(timing.entries).toHaveLength(2);

    timing.clock = NOW;
    const later = await run(feed(VACATION), timing, "scheduler", NOW);
    expect(later.actions.map((a) => [a.date, a.action])).toEqual([
      ["2026-12-23", "timingCreated"],
    ]);
    expect(timing.entries).toHaveLength(3);
    expect(timing.createTimeEntry).toHaveBeenCalledTimes(3);
    expect(timewarpEntries()).toHaveLength(3);
    expect(
      timewarpEntries()
        .map((e) => e.externalId)
        .sort(),
    ).toEqual(timing.entries.map((e) => e.self).sort());
  });
});

describe("syncCalendarForUser – Storno, Timing aus, unterdrückte Tage", () => {
  it("Storno löscht eigene Einträge in Timing und lokal, fremde werden entkoppelt", async () => {
    const timing = fakeTiming();
    await run(feed(VACATION), timing);
    // Ein fremder, verknüpfter Eintrag (z. B. aus dem Timing-Sync)
    db.entries.push({
      id: "foreign",
      userId: USER,
      date: new Date("2026-12-24T00:00:00.000Z"),
      type: "VACATION",
      source: "MANUAL",
      absenceId: db.absences[0].id,
      externalId: null,
      duration: 8,
    });

    const result = await run(feed(VACATION_CANCELLED), timing);
    expect(result.status).toBe("success");
    expect(result.stats).toMatchObject({
      cancelled: 1,
      absencesCancelled: 1,
      deleted: 3,
      unlinked: 1,
    });
    expect(db.absences[0].status).toBe("CANCELLED");
    expect(timing.entries).toHaveLength(0);
    expect(timing.deleteTimeEntry).toHaveBeenCalledTimes(3);
    expect(timewarpEntries()).toHaveLength(0);
    expect(db.entries.find((e) => e.id === "foreign")?.absenceId).toBeNull();
  });

  it("Löschen in Timing scheitert: lokaler Eintrag bleibt, nächster Lauf versucht es erneut", async () => {
    const timing = fakeTiming();
    await run(feed(VACATION), timing);
    vi.mocked(timing.deleteTimeEntry).mockRejectedValueOnce(
      new TimingApiError("NETWORK_ERROR", "Timing-API nicht erreichbar."),
    );

    const first = await run(feed(VACATION_CANCELLED), timing);
    expect(first.stats).toMatchObject({ deleted: 2, failed: 1 });
    expect(timewarpEntries()).toHaveLength(1);

    const second = await run(feed(VACATION_CANCELLED), timing);
    expect(second.stats).toMatchObject({ deleted: 1, failed: 0 });
    expect(timewarpEntries()).toHaveLength(0);
    expect(timing.entries).toHaveLength(0);
  });

  it("verschwundene künftige Abwesenheit wird storniert und aufgeräumt", async () => {
    const timing = fakeTiming(BEFORE);
    await run(feed(VACATION, EVENT), timing, "manual", BEFORE);
    const result = await run(feed(EVENT), timing, "manual", BEFORE);
    expect(result.stats.absencesCancelled).toBe(1);
    expect(db.absences[0].status).toBe("CANCELLED");
    expect(timewarpEntries()).toHaveLength(0);
    expect(timing.entries).toHaveLength(0);
  });

  it("ohne Timing-Projekt nur lokale Einträge, mit Hinweis", async () => {
    db.integration = { ...db.integration, timingProjectId: null };
    const timing = fakeTiming();
    const result = await run(feed(VACATION), timing);

    expect(result.stats.timingSkippedReason).toMatch(/Kein Timing-Projekt/);
    expect(result.stats).toMatchObject({ created: 3, timingCreated: 0 });
    expect(result.actions[0].detail).toMatch(/Nicht in Timing/);
    expect(timing.createTimeEntry).not.toHaveBeenCalled();
    expect(timewarpEntries()[0]).toMatchObject({
      externalId: null,
      billingStatus: null,
    });
  });

  it("ohne Timing-Token nur lokale Einträge", async () => {
    const result = await run(feed(VACATION));
    expect(result.stats.timingSkippedReason).toMatch(/Kein Timing-Token/);
    expect(result.stats.created).toBe(3);
  });

  it("Schreiben nach Timing abgeschaltet: lokale Einträge ohne Hinweis", async () => {
    db.integration = { ...db.integration, writeToTiming: false };
    const timing = fakeTiming();
    const result = await run(feed(VACATION), timing);
    expect(result.stats.timingSkippedReason).toBeNull();
    expect(result.actions[0].detail).not.toMatch(/Nicht in Timing/);
    expect(timing.createTimeEntry).not.toHaveBeenCalled();
  });

  it("legt einen von Hand gelöschten (unterdrückten) Tag nicht neu an", async () => {
    const timing = fakeTiming();
    await run(feed(VACATION), timing);
    // Wie DELETE /api/time-entries/[id]: Eintrag weg, Tag unterdrückt
    db.entries = db.entries.filter(
      (e) => (e.date as Date).toISOString().slice(0, 10) !== "2026-12-22",
    );
    db.absences[0].suppressedDates = ["2026-12-22"];

    const result = await run(feed(VACATION), timing);
    expect(result.actions).toEqual([]);
    expect(timewarpEntries()).toHaveLength(2);
  });

  it("lässt vergangene, aus dem Feed gefallene Abwesenheiten unangetastet", async () => {
    db.absences.push({
      id: "past",
      userId: USER,
      source: "TIMEWARP",
      externalUid: "abs-old",
      kind: "VACATION",
      rawType: "URLAUB",
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-02T00:00:00.000Z"),
      halfDay: false,
      status: "ACTIVE",
      sequence: 0,
      suppressedDates: [],
    });
    const timing = fakeTiming();
    const result = await run(feed(VACATION), timing);
    expect(db.absences.find((a) => a.id === "past")?.status).toBe("ACTIVE");
    expect(result.actions.every((a) => a.date >= "2026-12-21")).toBe(true);
  });

  it("behält nur die letzten 50 Protokolle", async () => {
    for (let i = 0; i < 50; i++) {
      db.logs.push({
        id: `old-${i}`,
        userId: USER,
        startedAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
        status: "success",
        actions: [],
      });
    }
    await run(feed(VACATION), fakeTiming());
    expect(db.logs).toHaveLength(50);
    expect(db.logs.some((l) => l.id === "old-0")).toBe(false);
  });
});

describe("syncCalendarForUser – Prüfung vor dem PR", () => {
  function foreign(self: string, day: string, notes: string | null) {
    return {
      self,
      start_date: `${day}T07:00:00.000Z`,
      end_date: `${day}T15:00:00.000Z`,
      duration: 28_800,
      project: { self: PROJECT, title_chain: ["Work", "INNOQ", "Urlaub"] },
      title: "Weihnachtsurlaub",
      notes,
      is_running: false,
    } satisfies TimingApiTimeEntry;
  }

  it("verknüpft keinen fremden Timing-Eintrag außerhalb der Projekt-Wurzeln des Timing-Syncs", async () => {
    // Der Timing-Sync würde einen solchen TIMING_SYNC-Eintrag sonst als
    // „in Timing gelöscht“ entfernen und den Tag unterdrücken
    db.timingIntegration = { projectRoots: ["Kunden"] };
    const timing = fakeTiming();
    timing.entries.push(foreign("/time-entries/77", "2026-12-21", null));
    const result = await run(feed(VACATION), timing);

    expect(result.status).toBe("success");
    expect(db.entries.some((e) => e.externalId === "/time-entries/77")).toBe(
      false,
    );
    const on21 = db.entries.filter(
      (e) => (e.date as Date).toISOString().slice(0, 10) === "2026-12-21",
    );
    expect(on21).toHaveLength(1);
    expect(on21[0]).toMatchObject({ source: "TIMEWARP", externalId: null });
    // Fremder Eintrag bleibt, kein zweiter am 21.
    expect(
      timing.entries.filter((e) => e.start_date.startsWith("2026-12-21")),
    ).toEqual([expect.objectContaining({ self: "/time-entries/77" })]);

    const second = await run(feed(VACATION), timing);
    expect(second.actions).toEqual([]);
  });

  it("übernimmt nur die Notiz „Aus Timewarp“ als eigene, nicht einen Text, der sie enthält", async () => {
    const timing = fakeTiming();
    timing.entries.push(
      foreign(
        "/time-entries/79",
        "2026-12-21",
        "Aus Timewarp übernommen – Weihnachten",
      ),
    );
    await run(feed(VACATION), timing);
    expect(
      db.entries.find((e) => e.externalId === "/time-entries/79"),
    ).toMatchObject({ source: "TIMING_SYNC" });

    // Storno: fremder Eintrag bleibt in Timing
    await run(feed(VACATION_CANCELLED), timing);
    expect(timing.entries.map((e) => e.self)).toEqual(["/time-entries/79"]);
  });

  it("löscht einen eben angelegten Timing-Eintrag nicht, wenn der Timing-Sync ihn inzwischen importiert hat", async () => {
    const timing = fakeTiming();
    const create = vi.mocked(timing.createTimeEntry);
    const impl = create.getMockImplementation();
    create.mockImplementation(async (input) => {
      const result = await (impl as NonNullable<typeof impl>)(input);
      if (input.start.toISOString().startsWith("2026-12-22")) {
        // Parallel: der Timing-Sync importiert den neuen Eintrag
        db.entries.push({
          id: "synced-22",
          userId: USER,
          date: new Date("2026-12-22T00:00:00.000Z"),
          type: "VACATION",
          source: "TIMING_SYNC",
          externalId: result.self,
          absenceId: null,
          duration: 8,
        });
      }
      return result;
    });

    const result = await run(feed(VACATION), timing);
    expect(result.status).toBe("success");
    // Der importierte Eintrag ist verknüpft und bleibt in Timing
    expect(db.entries.find((e) => e.id === "synced-22")).toMatchObject({
      absenceId: db.absences[0].id,
    });
    expect(timing.entries).toHaveLength(3);
    expect(result.stats.deleted).toBe(0);
  });
  it("trägt lokal angelegte Urlaubstage nach Timing nach, sobald das Projekt gewählt ist", async () => {
    // Erster Lauf vor dem Speichern des Urlaubsprojekts: nur lokal
    db.integration = { ...db.integration, timingProjectId: null };
    const timing = fakeTiming();
    await run(feed(VACATION), timing);
    expect(timing.entries).toHaveLength(0);
    const localIds = timewarpEntries().map((e) => e.id);

    // Fremder Urlaub am 21. in Timing: verknüpfen statt doppelt anlegen
    timing.entries.push(foreign("/time-entries/90", "2026-12-21", null));
    db.integration = { ...db.integration, timingProjectId: PROJECT };
    const result = await run(feed(VACATION), timing);

    expect(result.status).toBe("success");
    expect(result.stats).toMatchObject({ timingCreated: 2, linked: 1 });
    expect(timing.entries).toHaveLength(3);
    expect(
      timing.entries.filter((e) => e.start_date.startsWith("2026-12-21")),
    ).toHaveLength(1);
    // 22. und 23.: dieselben lokalen Einträge, jetzt mit Timing-ID
    const own = timewarpEntries();
    expect(own).toHaveLength(2);
    expect(own.every((e) => localIds.includes(e.id as string))).toBe(true);
    expect(own.every((e) => typeof e.externalId === "string")).toBe(true);
    expect(
      db.entries.find((e) => e.externalId === "/time-entries/90"),
    ).toMatchObject({ source: "TIMING_SYNC", absenceId: db.absences[0].id });

    const third = await run(feed(VACATION), timing);
    expect(third.actions).toEqual([]);
    expect(timing.entries).toHaveLength(3);
  });

  it("lässt einen lokalen Tag in Ruhe, wenn Timing dort schon einen anderen Eintrag im Projekt hat", async () => {
    db.integration = { ...db.integration, timingProjectId: null };
    const timing = fakeTiming();
    await run(feed(VACATION), timing);
    timing.entries.push({
      ...foreign("/time-entries/91", "2026-12-21", null),
      project: { self: PROJECT, title_chain: ["Work", "INNOQ", "Kunde"] },
    });
    db.integration = { ...db.integration, timingProjectId: PROJECT };
    await run(feed(VACATION), timing);
    const again = await run(feed(VACATION), timing);
    expect(again.actions).toEqual([]);
    expect(
      timing.entries.filter((e) => e.start_date.startsWith("2026-12-21")),
    ).toHaveLength(1);
  });
});
