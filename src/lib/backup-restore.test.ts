import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  absencesFromBackup,
  keepMissingSyncFields,
  resolveRestoreSource,
  restoreAbsenceId,
  settingsFromBackup,
  travelDaysFromBackup,
} from "./backup-restore";

describe("resolveRestoreSource", () => {
  it("übernimmt eine gültige Quelle aus neuen Backups", () => {
    expect(resolveRestoreSource({ type: "WORK", source: "TIMING_SYNC" })).toBe(
      "TIMING_SYNC",
    );
  });

  it("wendet für Alt-Backups die Regeln der Migration an", () => {
    expect(
      resolveRestoreSource({
        type: "WORK",
        description: "Anfangs-Überstunden-Saldo: 12h",
      }),
    ).toBe("ADJUSTMENT");
    expect(resolveRestoreSource({ type: "HOLIDAY", description: null })).toBe(
      "HOLIDAY",
    );
    expect(resolveRestoreSource({ type: "WORK", description: "Alpha" })).toBe(
      "MANUAL",
    );
    expect(resolveRestoreSource({ type: "WORK", source: "UNKNOWN" })).toBe(
      "MANUAL",
    );
  });
});

describe("keepMissingSyncFields", () => {
  const existing = {
    source: "TIMING_SYNC",
    externalId: "/time-entries/1",
    title: "Alpha | 101: Backend",
    notes: "API-Design",
    projectPath: "Work ▸ Firma ▸ Kunde A",
    billingStatus: "Billable",
  };
  const fromBackup = {
    source: "MANUAL",
    externalId: null,
    title: null,
    notes: null,
    projectPath: null,
    billingStatus: null,
    duration: 2,
  };

  it("stuft vorhandene Sync-Einträge durch Alt-Backups nicht herab", () => {
    const legacyEntry = { type: "WORK", duration: "2" };
    expect(keepMissingSyncFields(fromBackup, legacyEntry, existing)).toEqual({
      ...existing,
      duration: 2,
    });
  });

  it("nimmt die Werte neuer Backups vollständig", () => {
    const newEntry = { ...fromBackup, type: "WORK" };
    expect(keepMissingSyncFields(fromBackup, newEntry, existing)).toEqual(
      fromBackup,
    );
  });
});

describe("settingsFromBackup", () => {
  it("akzeptiert alte Backups und ignoriert entfernte Felder", () => {
    const legacy = {
      id: "s1",
      userId: "u1",
      weeklyWorkHours: "38.5",
      workDays: [1, 2, 3, 4],
      defaultStartTime: "08:00",
      defaultEndTime: "16:30",
      breakDuration: "0.75",
      timezone: "Europe/London",
      overtimeNotification: false,
      language: "en",
      theme: "dark",
      createdAt: "2025-09-12T10:00:00.000Z",
      updatedAt: "2025-09-12T10:00:00.000Z",
    };
    expect(settingsFromBackup(legacy)).toEqual({
      weeklyWorkHours: 38.5,
      workDays: [1, 2, 3, 4],
      annualVacationDays: 30,
    });
  });

  it("übernimmt den Urlaubsanspruch neuer Backups (Decimal als String)", () => {
    expect(
      settingsFromBackup({
        weeklyWorkHours: "40",
        workDays: [1, 2, 3, 4, 5],
        annualVacationDays: "27.5",
      }),
    ).toEqual({
      weeklyWorkHours: 40,
      workDays: [1, 2, 3, 4, 5],
      annualVacationDays: 27.5,
    });
  });

  it("fällt bei fehlenden oder ungültigen Werten auf Standardwerte zurück", () => {
    expect(
      settingsFromBackup({
        weeklyWorkHours: "abc",
        workDays: [],
        annualVacationDays: 99,
      }),
    ).toEqual({
      weeklyWorkHours: 40,
      workDays: [1, 2, 3, 4, 5],
      annualVacationDays: 30,
    });
    expect(settingsFromBackup(null)).toEqual({
      weeklyWorkHours: 40,
      workDays: [1, 2, 3, 4, 5],
      annualVacationDays: 30,
    });
  });
});

describe("travelDaysFromBackup", () => {
  it("liefert für alte Backups ohne Reisetage null", () => {
    expect(travelDaysFromBackup({ entries: [] })).toBeNull();
    expect(travelDaysFromBackup(undefined)).toBeNull();
    expect(travelDaysFromBackup({ travelDays: "kaputt" })).toBeNull();
  });

  it("übernimmt Reisetage als Datums-Key, auch aus ISO-Zeitstempeln", () => {
    expect(
      travelDaysFromBackup({
        travelDays: [
          { date: "2026-03-02", isTravel: true },
          { date: "2026-03-03T00:00:00.000Z", isTravel: false },
        ],
      }),
    ).toEqual([
      { date: "2026-03-02", isTravel: true },
      { date: "2026-03-03", isTravel: false },
    ]);
  });

  it("verwirft ungültige Zeilen und behält bei Dubletten die letzte", () => {
    expect(
      travelDaysFromBackup({
        travelDays: [
          { date: "2026-02-30", isTravel: true },
          { date: "2026-03-02", isTravel: "ja" },
          null,
          { date: "2026-03-02", isTravel: true },
          { date: "2026-03-02", isTravel: false },
        ],
      }),
    ).toEqual([{ date: "2026-03-02", isTravel: false }]);
  });

  it("liefert für ein leeres Feld eine leere Liste", () => {
    expect(travelDaysFromBackup({ travelDays: [] })).toEqual([]);
  });
});

describe("absencesFromBackup", () => {
  const valid = {
    id: "old-1",
    source: "TIMEWARP",
    externalUid: "uid-1@timewarp",
    kind: "SPECIAL_LEAVE",
    rawType: "SONDERURLAUB",
    startDate: "2026-11-02",
    endDate: "2026-11-03",
    halfDay: false,
    status: "ACTIVE",
    sequence: 2,
    lastSeenAt: "2026-10-11T08:00:00.000Z",
    suppressedDates: ["2026-11-03", "kaputt", "2026-11-02", "2026-11-03"],
  };

  it("liefert null für Backups ohne Abwesenheiten (älteres Format)", () => {
    expect(absencesFromBackup({ entries: [] })).toBeNull();
    expect(absencesFromBackup(null)).toBeNull();
  });

  it("übernimmt gültige Abwesenheiten, Datum auch als ISO-Zeitstempel", () => {
    const result = absencesFromBackup({
      absences: [
        valid,
        {
          id: "old-2",
          source: "MANUAL",
          kind: "VACATION",
          startDate: "2026-08-03T00:00:00.000Z",
          endDate: "2026-08-07T00:00:00.000Z",
          status: "ACTIVE",
        },
      ],
    });
    expect(result).toEqual([
      {
        id: "old-1",
        source: "TIMEWARP",
        externalUid: "uid-1@timewarp",
        kind: "SPECIAL_LEAVE",
        rawType: "SONDERURLAUB",
        startDate: "2026-11-02",
        endDate: "2026-11-03",
        halfDay: false,
        status: "ACTIVE",
        sequence: 2,
        lastSeenAt: "2026-10-11T08:00:00.000Z",
        suppressedDates: ["2026-11-02", "2026-11-03"],
      },
      {
        id: "old-2",
        source: "MANUAL",
        externalUid: null,
        kind: "VACATION",
        rawType: null,
        startDate: "2026-08-03",
        endDate: "2026-08-07",
        halfDay: false,
        status: "ACTIVE",
        sequence: null,
        lastSeenAt: null,
        suppressedDates: [],
      },
    ]);
  });

  it("verwirft ungültige Zeilen", () => {
    const result = absencesFromBackup({
      absences: [
        { ...valid, kind: "SICK" },
        { ...valid, source: "OUTLOOK" },
        { ...valid, status: "DONE" },
        { ...valid, startDate: "2026-13-01" },
        { ...valid, startDate: "2026-11-05", endDate: "2026-11-04" },
        { ...valid, id: undefined },
        "kaputt",
      ],
    });
    expect(result).toEqual([]);
  });
});

describe("restoreAbsenceId", () => {
  const ids = new Map([["old-1", "new-1"]]);

  it("übersetzt die alte ID auf die wiederhergestellte Abwesenheit", () => {
    expect(restoreAbsenceId({ absenceId: "old-1" }, ids)).toBe("new-1");
  });

  it("entkoppelt Einträge, deren Abwesenheit nicht im Backup ist", () => {
    expect(restoreAbsenceId({ absenceId: "fehlt" }, ids)).toBeNull();
    expect(restoreAbsenceId({ absenceId: null }, ids)).toBeNull();
  });

  it("lässt das Feld bei älteren Backups unangetastet (undefined)", () => {
    expect(restoreAbsenceId({}, ids)).toBeUndefined();
  });
});
