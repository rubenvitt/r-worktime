import { describe, expect, it } from "vitest";
import { planAbsences, type StoredAbsence } from "./plan-absences";
import type { ParsedAbsence } from "./timewarp";

const TODAY = "2026-10-11";

function parsed(overrides: Partial<ParsedAbsence> = {}): ParsedAbsence {
  return {
    uid: "uid-1",
    sequence: 1,
    kind: "VACATION",
    rawType: "URLAUB",
    startDate: "2026-12-21",
    endDate: "2026-12-23",
    halfDay: false,
    cancelled: false,
    ...overrides,
  };
}

function stored(overrides: Partial<StoredAbsence> = {}): StoredAbsence {
  return {
    id: "abs-1",
    externalUid: "uid-1",
    kind: "VACATION",
    rawType: "URLAUB",
    startDate: "2026-12-21",
    endDate: "2026-12-23",
    halfDay: false,
    status: "ACTIVE",
    sequence: 1,
    ...overrides,
  };
}

describe("planAbsences", () => {
  it("legt neue UIDs an, aktiv oder storniert", () => {
    const plan = planAbsences(
      [],
      [parsed(), parsed({ uid: "uid-2", cancelled: true })],
      TODAY,
    );
    expect(plan.create).toEqual([
      expect.objectContaining({ externalUid: "uid-1", status: "ACTIVE" }),
      expect.objectContaining({ externalUid: "uid-2", status: "CANCELLED" }),
    ]);
    expect(plan.update).toEqual([]);
  });

  it("lässt unveränderte Abwesenheiten in Ruhe, merkt sie aber als gesehen", () => {
    const plan = planAbsences([stored()], [parsed()], TODAY);
    expect(plan).toMatchObject({
      create: [],
      update: [],
      seen: ["abs-1"],
      unchanged: 1,
      cancelMissing: [],
    });
  });

  it("übernimmt geänderte Felder", () => {
    const plan = planAbsences(
      [stored()],
      [parsed({ sequence: 2, endDate: "2026-12-30", halfDay: false })],
      TODAY,
    );
    expect(plan.update).toEqual([
      {
        id: "abs-1",
        data: expect.objectContaining({ endDate: "2026-12-30", sequence: 2 }),
      },
    ]);
  });

  it("storniert über STATUS:CANCELLED", () => {
    const plan = planAbsences(
      [stored()],
      [parsed({ sequence: 2, cancelled: true })],
      TODAY,
    );
    expect(plan.update[0].data.status).toBe("CANCELLED");
  });

  it("reaktiviert eine wieder aufgenommene Abwesenheit", () => {
    const plan = planAbsences(
      [stored({ status: "CANCELLED" })],
      [parsed({ sequence: 3 })],
      TODAY,
    );
    expect(plan.update[0].data.status).toBe("ACTIVE");
  });

  it("ignoriert eine niedrigere SEQUENCE", () => {
    const plan = planAbsences(
      [stored({ sequence: 4 })],
      [parsed({ sequence: 2, cancelled: true })],
      TODAY,
    );
    expect(plan.update).toEqual([]);
    expect(plan.ignoredLowerSequence).toEqual(["uid-1"]);
    expect(plan.seen).toEqual(["abs-1"]);
  });

  it("storniert fehlende Abwesenheiten nur in der Zukunft", () => {
    const plan = planAbsences(
      [
        stored({ id: "future", externalUid: "f", startDate: "2026-10-12" }),
        stored({ id: "today", externalUid: "t", startDate: TODAY }),
        stored({
          id: "past",
          externalUid: "p",
          startDate: "2026-09-01",
          endDate: "2026-09-05",
        }),
        stored({
          id: "gone",
          externalUid: "g",
          startDate: "2027-01-01",
          status: "CANCELLED",
        }),
      ],
      [],
      TODAY,
    );
    expect(plan.cancelMissing).toEqual(["future"]);
    expect(plan.seen).toEqual([]);
  });
});
