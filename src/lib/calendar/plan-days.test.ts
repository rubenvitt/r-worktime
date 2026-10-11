import { describe, expect, it } from "vitest";
import {
  type DayPlanAbsence,
  type DayPlanEntry,
  type DayPlanInput,
  isOwnTimingNote,
  planDays,
  timewarpDayTimes,
} from "./plan-days";

// Mo 21.12.2026 bis Fr 25.12.2026 (1. Weihnachtstag), dann Wochenende
const HOLIDAYS = { "2026-12-25": "1. Weihnachtstag" };

function absence(overrides: Partial<DayPlanAbsence> = {}): DayPlanAbsence {
  return {
    id: "abs-1",
    kind: "VACATION",
    startDate: "2026-12-21",
    endDate: "2026-12-23",
    halfDay: false,
    status: "ACTIVE",
    suppressedDates: [],
    ...overrides,
  };
}

let nextId = 0;
function entry(overrides: Partial<DayPlanEntry> = {}): DayPlanEntry {
  nextId++;
  return {
    id: `e-${nextId}`,
    date: "2026-12-21",
    type: "VACATION",
    source: "TIMEWARP",
    absenceId: "abs-1",
    externalId: `/time-entries/${nextId}`,
    duration: 8,
    ...overrides,
  };
}

function input(overrides: Partial<DayPlanInput> = {}): DayPlanInput {
  return {
    absences: [absence()],
    entries: [],
    workDays: [1, 2, 3, 4, 5],
    dailyHours: 8,
    officialHolidays: HOLIDAYS,
    timingEnabled: true,
    ...overrides,
  };
}

const dates = (items: { date: string }[]) => items.map((item) => item.date);

describe("planDays – anlegen", () => {
  it("legt je Arbeitstag einen Eintrag an, 08:00 Berliner Zeit, Dauer = Tagessoll", () => {
    const plan = planDays(input());
    expect(dates(plan.create)).toEqual([
      "2026-12-21",
      "2026-12-22",
      "2026-12-23",
    ]);
    expect(plan.create[0]).toMatchObject({
      absenceId: "abs-1",
      kind: "VACATION",
      entryType: "VACATION",
      hours: 8,
      halfDay: false,
      toTiming: true,
      replaces: null,
      startTime: new Date("2026-12-21T07:00:00.000Z"),
      endTime: new Date("2026-12-21T15:00:00.000Z"),
    });
    expect(plan.link).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it("halber Tag: halbes Tagessoll", () => {
    const plan = planDays(
      input({
        absences: [absence({ endDate: "2026-12-21", halfDay: true })],
        dailyHours: 7.5,
      }),
    );
    expect(plan.create).toEqual([
      expect.objectContaining({
        hours: 3.75,
        halfDay: true,
        startTime: new Date("2026-12-21T07:00:00.000Z"),
        endTime: new Date("2026-12-21T10:45:00.000Z"),
      }),
    ]);
  });

  it("überspringt Wochenenden, offizielle und importierte Feiertage", () => {
    const plan = planDays(
      input({
        absences: [absence({ endDate: "2026-12-27" })],
        entries: [
          entry({
            date: "2026-12-24",
            type: "HOLIDAY",
            source: "HOLIDAY",
            absenceId: null,
            externalId: null,
          }),
        ],
      }),
    );
    expect(dates(plan.create)).toEqual([
      "2026-12-21",
      "2026-12-22",
      "2026-12-23",
    ]);
  });

  it("schreibt nicht nach Timing, wenn Timing aus ist oder die Art keinen Eintrag bekommt", () => {
    expect(
      planDays(input({ timingEnabled: false })).create.every(
        (c) => !c.toTiming,
      ),
    ).toBe(true);

    const plan = planDays(
      input({ absences: [absence({ kind: "OVERTIME_REDUCTION" })] }),
    );
    expect(plan.create[0]).toMatchObject({
      entryType: "OVERTIME_REDUCTION",
      toTiming: false,
    });

    const unpaid = planDays(
      input({ absences: [absence({ kind: "SABBATICAL" })] }),
    );
    expect(unpaid.create[0]).toMatchObject({
      entryType: "UNPAID_LEAVE",
      toTiming: false,
    });

    const special = planDays(
      input({ absences: [absence({ kind: "SPECIAL_LEAVE" })] }),
    );
    expect(special.create[0]).toMatchObject({
      entryType: "VACATION",
      toTiming: true,
    });
  });
});

describe("planDays – verknüpfen", () => {
  it("verknüpft vorhandene Einträge desselben Typs ohne Abwesenheit (Timing-Sync, manuell)", () => {
    const fromTiming = entry({
      date: "2026-12-22",
      source: "TIMING_SYNC",
      absenceId: null,
    });
    const manual = entry({
      date: "2026-12-23",
      source: "MANUAL",
      absenceId: null,
      externalId: null,
    });
    const plan = planDays(input({ entries: [fromTiming, manual] }));
    expect(plan.link).toEqual([
      {
        absenceId: "abs-1",
        kind: "VACATION",
        date: "2026-12-22",
        entryId: fromTiming.id,
      },
      {
        absenceId: "abs-1",
        kind: "VACATION",
        date: "2026-12-23",
        entryId: manual.id,
      },
    ]);
    expect(dates(plan.create)).toEqual(["2026-12-21"]);
  });

  it("verknüpft keine anderen Typen, keine Saldo- oder Feiertagseinträge und keine fremd verknüpften", () => {
    const plan = planDays(
      input({
        entries: [
          entry({
            date: "2026-12-21",
            type: "WORK",
            source: "MANUAL",
            absenceId: null,
          }),
          entry({ date: "2026-12-22", source: "ADJUSTMENT", absenceId: null }),
          entry({
            date: "2026-12-23",
            source: "MANUAL",
            absenceId: "manual-abs",
          }),
        ],
      }),
    );
    expect(plan.link).toEqual([]);
    // 23.: von einer anderen Abwesenheit belegt – kein zweiter Eintrag
    expect(dates(plan.create)).toEqual(["2026-12-21", "2026-12-22"]);
  });

  it("legt an Tagen nichts an, die eine andere Abwesenheit (Dialog) oder Krankheit belegt", () => {
    const plan = planDays(
      input({
        entries: [
          // Dialog „Abwesenheit eintragen“: MANUAL mit eigener Abwesenheit
          entry({
            date: "2026-12-21",
            source: "MANUAL",
            absenceId: "manual-abs",
            externalId: null,
          }),
          entry({
            date: "2026-12-22",
            type: "SICK",
            source: "TIMING_SYNC",
            absenceId: null,
          }),
        ],
      }),
    );
    expect(plan.link).toEqual([]);
    expect(dates(plan.create)).toEqual(["2026-12-23"]);
  });

  it("verknüpft Überstundenabbau nur mit Überstundenabbau", () => {
    const vacation = entry({ source: "TIMING_SYNC", absenceId: null });
    const reduction = entry({
      date: "2026-12-22",
      type: "OVERTIME_REDUCTION",
      source: "MANUAL",
      absenceId: null,
    });
    const plan = planDays(
      input({
        absences: [absence({ kind: "OVERTIME_REDUCTION" })],
        entries: [vacation, reduction],
      }),
    );
    expect(plan.link.map((l) => l.entryId)).toEqual([reduction.id]);
    expect(dates(plan.create)).toEqual(["2026-12-21", "2026-12-23"]);
  });

  it("lässt vorhandene verknüpfte Einträge in Ruhe", () => {
    const plan = planDays(
      input({
        entries: [
          entry({ date: "2026-12-21" }),
          entry({ date: "2026-12-22", source: "TIMING_SYNC", duration: 4 }),
          entry({ date: "2026-12-23" }),
        ],
      }),
    );
    expect(plan).toEqual({ link: [], create: [], remove: [], unlink: [] });
  });
});

describe("planDays – entfernen und entkoppeln", () => {
  it("Zeitraum verkürzt: eigene Einträge löschen, fremde entkoppeln", () => {
    const own = entry({ date: "2026-12-23", externalId: "/time-entries/77" });
    const foreign = entry({ date: "2026-12-22", source: "TIMING_SYNC" });
    const plan = planDays(
      input({
        absences: [absence({ endDate: "2026-12-21" })],
        entries: [entry({ date: "2026-12-21" }), own, foreign],
      }),
    );
    expect(plan.remove).toEqual([
      {
        absenceId: "abs-1",
        kind: "VACATION",
        date: "2026-12-23",
        entryId: own.id,
        externalId: "/time-entries/77",
        reason: "notPlanned",
      },
    ]);
    expect(plan.unlink).toEqual([
      {
        absenceId: "abs-1",
        kind: "VACATION",
        date: "2026-12-22",
        entryId: foreign.id,
      },
    ]);
    expect(plan.create).toEqual([]);
  });

  it("Zeitraum verlängert: nur die neuen Tage anlegen", () => {
    const plan = planDays(
      input({
        absences: [absence({ endDate: "2026-12-24" })],
        entries: [entry({ date: "2026-12-21" }), entry({ date: "2026-12-22" })],
      }),
    );
    expect(dates(plan.create)).toEqual(["2026-12-23", "2026-12-24"]);
    expect(plan.remove).toEqual([]);
  });

  it("storniert: alles eigene löschen, fremdes entkoppeln, nichts anlegen", () => {
    const own = entry({ date: "2026-12-21", externalId: null });
    const foreign = entry({ date: "2026-12-22", source: "MANUAL" });
    const plan = planDays(
      input({
        absences: [absence({ status: "CANCELLED" })],
        entries: [own, foreign],
      }),
    );
    expect(plan.remove.map((r) => [r.entryId, r.externalId])).toEqual([
      [own.id, null],
    ]);
    expect(plan.unlink.map((u) => u.entryId)).toEqual([foreign.id]);
    expect(plan.create).toEqual([]);
    expect(plan.link).toEqual([]);
  });

  it("entfernt eigene Einträge an einem Feiertag", () => {
    const own = entry({ date: "2026-12-25" });
    const plan = planDays(
      input({ absences: [absence({ endDate: "2026-12-25" })], entries: [own] }),
    );
    expect(plan.remove.map((r) => r.entryId)).toEqual([own.id]);
  });

  it("doppelte Verknüpfung am selben Tag: fremden behalten, eigenen löschen", () => {
    const own = entry({ date: "2026-12-21" });
    const foreign = entry({ date: "2026-12-21", source: "TIMING_SYNC" });
    const plan = planDays(
      input({
        absences: [absence({ endDate: "2026-12-21" })],
        entries: [own, foreign],
      }),
    );
    expect(plan.remove).toEqual([
      expect.objectContaining({ entryId: own.id, reason: "duplicate" }),
    ]);
    expect(plan.unlink).toEqual([]);
    expect(plan.create).toEqual([]);
  });
});

describe("planDays – ganz und halb", () => {
  it("ganz → halb: eigenen Eintrag ersetzen", () => {
    const own = entry({ date: "2026-12-21", duration: 8 });
    const plan = planDays(
      input({
        absences: [absence({ endDate: "2026-12-21", halfDay: true })],
        entries: [own],
      }),
    );
    expect(plan.remove).toEqual([
      expect.objectContaining({ entryId: own.id, reason: "halfDayChanged" }),
    ]);
    expect(plan.create).toEqual([
      expect.objectContaining({
        date: "2026-12-21",
        hours: 4,
        halfDay: true,
        replaces: own.id,
        endTime: new Date("2026-12-21T11:00:00.000Z"),
      }),
    ]);
  });

  it("halb → ganz: eigenen Eintrag ersetzen", () => {
    const own = entry({ date: "2026-12-21", duration: 4 });
    const plan = planDays(
      input({ absences: [absence({ endDate: "2026-12-21" })], entries: [own] }),
    );
    expect(plan.remove.map((r) => r.reason)).toEqual(["halfDayChanged"]);
    expect(plan.create[0]).toMatchObject({ hours: 8, replaces: own.id });
  });

  it("geänderte Wochenstunden ersetzen keine eigenen Einträge", () => {
    const plan = planDays(
      input({
        absences: [absence({ endDate: "2026-12-21" })],
        entries: [entry({ date: "2026-12-21", duration: 8 })],
        dailyHours: 7,
      }),
    );
    expect(plan).toEqual({ link: [], create: [], remove: [], unlink: [] });
  });

  it("fremde verknüpfte Einträge werden bei ganz/halb nie ersetzt", () => {
    const plan = planDays(
      input({
        absences: [absence({ endDate: "2026-12-21", halfDay: true })],
        entries: [
          entry({ date: "2026-12-21", source: "TIMING_SYNC", duration: 8 }),
        ],
      }),
    );
    expect(plan).toEqual({ link: [], create: [], remove: [], unlink: [] });
  });
});

describe("planDays – Art geändert", () => {
  it("Urlaub → Überstundenabbau: eigene Einträge ersetzen, ohne Timing", () => {
    const own = entry({ date: "2026-12-21" });
    const plan = planDays(
      input({
        absences: [
          absence({ kind: "OVERTIME_REDUCTION", endDate: "2026-12-21" }),
        ],
        entries: [own],
      }),
    );
    expect(plan.remove).toEqual([
      expect.objectContaining({
        entryId: own.id,
        externalId: own.externalId,
        reason: "kindChanged",
      }),
    ]);
    expect(plan.create).toEqual([
      expect.objectContaining({
        date: "2026-12-21",
        entryType: "OVERTIME_REDUCTION",
        toTiming: false,
        replaces: own.id,
      }),
    ]);
  });

  it("fremde Einträge der alten Art werden gelöst, ein passender freier Eintrag verknüpft", () => {
    const foreign = entry({ date: "2026-12-21", source: "TIMING_SYNC" });
    const reduction = entry({
      date: "2026-12-21",
      type: "OVERTIME_REDUCTION",
      source: "MANUAL",
      absenceId: null,
    });
    const plan = planDays(
      input({
        absences: [
          absence({ kind: "OVERTIME_REDUCTION", endDate: "2026-12-21" }),
        ],
        entries: [foreign, reduction],
      }),
    );
    expect(plan.unlink.map((u) => u.entryId)).toEqual([foreign.id]);
    expect(plan.link.map((l) => l.entryId)).toEqual([reduction.id]);
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it("Sonderurlaub statt Urlaub bleibt beim Eintragstyp VACATION: nichts zu tun", () => {
    const plan = planDays(
      input({
        absences: [absence({ kind: "SPECIAL_LEAVE", endDate: "2026-12-21" })],
        entries: [entry({ date: "2026-12-21" })],
      }),
    );
    expect(plan).toEqual({ link: [], create: [], remove: [], unlink: [] });
  });
});

describe("planDays – unterdrückte Tage", () => {
  it("legt unterdrückte Tage nicht neu an und verknüpft dort nichts", () => {
    const plan = planDays(
      input({
        absences: [absence({ suppressedDates: ["2026-12-22"] })],
        entries: [
          entry({ date: "2026-12-22", source: "MANUAL", absenceId: null }),
        ],
      }),
    );
    expect(dates(plan.create)).toEqual(["2026-12-21", "2026-12-23"]);
    expect(plan.link).toEqual([]);
  });

  it("lässt an unterdrückten Tagen auch verknüpfte Einträge stehen", () => {
    const plan = planDays(
      input({
        absences: [
          absence({ endDate: "2026-12-21", suppressedDates: ["2026-12-21"] }),
        ],
        entries: [entry({ date: "2026-12-21" })],
      }),
    );
    expect(plan).toEqual({ link: [], create: [], remove: [], unlink: [] });
  });

  it("räumt bei Storno auch unterdrückte Tage auf", () => {
    const own = entry({ date: "2026-12-21" });
    const plan = planDays(
      input({
        absences: [
          absence({ status: "CANCELLED", suppressedDates: ["2026-12-21"] }),
        ],
        entries: [own],
      }),
    );
    expect(plan.remove.map((r) => r.entryId)).toEqual([own.id]);
  });
});

describe("planDays – mehrere Abwesenheiten", () => {
  it("vergibt jeden Tag nur einmal, vorhandene Verknüpfung hat Vorrang", () => {
    const linkedToSecond = entry({ date: "2026-12-22", absenceId: "abs-2" });
    const plan = planDays(
      input({
        absences: [
          absence({
            id: "abs-1",
            startDate: "2026-12-21",
            endDate: "2026-12-22",
          }),
          absence({
            id: "abs-2",
            startDate: "2026-12-22",
            endDate: "2026-12-23",
          }),
        ],
        entries: [linkedToSecond],
      }),
    );
    expect(plan.create.map((c) => [c.absenceId, c.date])).toEqual([
      ["abs-1", "2026-12-21"],
      ["abs-2", "2026-12-23"],
    ]);
    expect(plan.remove).toEqual([]);
  });

  it("verknüpft einen freien Eintrag nur einmal", () => {
    const free = entry({
      date: "2026-12-21",
      source: "MANUAL",
      absenceId: null,
    });
    const plan = planDays(
      input({
        absences: [
          absence({ id: "abs-1", endDate: "2026-12-21" }),
          absence({
            id: "abs-2",
            endDate: "2026-12-21",
            startDate: "2026-12-21",
          }),
        ],
        entries: [free],
      }),
    );
    expect(plan.link).toHaveLength(1);
    expect(plan.create).toEqual([]);
  });
});

describe("timewarpDayTimes", () => {
  it("rechnet über die Zeitumstellung korrekt", () => {
    // Sommerzeit: 08:00 Berlin = 06:00Z
    expect(timewarpDayTimes("2026-07-01", 8)).toEqual({
      startTime: new Date("2026-07-01T06:00:00.000Z"),
      endTime: new Date("2026-07-01T14:00:00.000Z"),
    });
  });
});

describe("isOwnTimingNote", () => {
  it("erkennt nur genau die Notiz „Aus Timewarp“ als eigene", () => {
    expect(isOwnTimingNote("Aus Timewarp")).toBe(true);
    expect(isOwnTimingNote("  Aus Timewarp\n")).toBe(true);
    expect(isOwnTimingNote("Aus Timewarp übernommen – Osterurlaub")).toBe(
      false,
    );
    expect(isOwnTimingNote("Urlaub (Aus Timewarp)")).toBe(false);
    expect(isOwnTimingNote(null)).toBe(false);
    expect(isOwnTimingNote(undefined)).toBe(false);
  });
});

describe("planDays – Timing nachtragen", () => {
  const localOnly = () =>
    ["2026-12-21", "2026-12-22", "2026-12-23"].map((date) =>
      entry({ date, externalId: null }),
    );

  it("plant eigene Einträge ohne Timing-ID zum Nachtragen ein, ohne lokal neu anzulegen", () => {
    const entries = localOnly();
    const plan = planDays(input({ entries }));
    expect(plan.create.map((c) => c.upgrades)).toEqual(
      entries.map((e) => e.id),
    );
    expect(plan.create.every((c) => c.toTiming)).toBe(true);
    expect(plan.remove).toEqual([]);
  });

  it("ohne Timing oder bei Arten ohne Timing-Eintrag nichts", () => {
    expect(
      planDays(input({ entries: localOnly(), timingEnabled: false })).create,
    ).toEqual([]);
    const reduction = localOnly().map((e) => ({
      ...e,
      type: "OVERTIME_REDUCTION",
    }));
    expect(
      planDays(
        input({
          absences: [absence({ kind: "OVERTIME_REDUCTION" })],
          entries: reduction,
        }),
      ).create,
    ).toEqual([]);
  });
});

describe("planDays – Timing nachtragen ohne Duplikat", () => {
  it("verknüpft einen inzwischen importierten Urlaub statt nachzutragen und entfernt den lokalen", () => {
    const own = entry({ date: "2026-12-21", externalId: null });
    const synced = entry({
      date: "2026-12-21",
      source: "TIMING_SYNC",
      absenceId: null,
      externalId: "/time-entries/555",
    });
    const plan = planDays(
      input({
        absences: [absence({ endDate: "2026-12-21" })],
        entries: [own, synced],
      }),
    );
    expect(plan.create).toEqual([]);
    expect(plan.link).toEqual([
      expect.objectContaining({ date: "2026-12-21", entryId: synced.id }),
    ]);
    expect(plan.remove).toEqual([
      expect.objectContaining({
        entryId: own.id,
        externalId: null,
        reason: "duplicate",
      }),
    ]);
  });

  it("trägt nicht nach, wenn der Tag inzwischen als Krankheit belegt ist", () => {
    const own = entry({ date: "2026-12-21", externalId: null });
    const sick = entry({
      date: "2026-12-21",
      type: "SICK",
      source: "TIMING_SYNC",
      absenceId: null,
      externalId: "/time-entries/556",
    });
    const plan = planDays(
      input({
        absences: [absence({ endDate: "2026-12-21" })],
        entries: [own, sick],
      }),
    );
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual([]);
  });
});
