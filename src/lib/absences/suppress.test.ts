import { describe, expect, it, vi } from "vitest";
import { mergeSuppressedDates, suppressAbsenceDays } from "./suppress";

describe("mergeSuppressedDates", () => {
  it("vereinigt sortiert und ohne Duplikate", () => {
    expect(
      mergeSuppressedDates(["2026-12-22"], ["2026-12-21", "2026-12-22"]),
    ).toEqual(["2026-12-21", "2026-12-22"]);
  });
});

describe("suppressAbsenceDays", () => {
  function dbWith(absences: { id: string; suppressedDates: string[] }[]) {
    return {
      absence: {
        findMany: vi.fn(async () => absences),
        update: vi.fn(async () => ({})),
      },
    };
  }

  it("vermerkt die Tage an Timewarp-Abwesenheiten", async () => {
    const db = dbWith([{ id: "abs-1", suppressedDates: ["2026-12-21"] }]);
    const added = await suppressAbsenceDays(db as never, "user-1", [
      { absenceId: "abs-1", date: new Date("2026-12-22T00:00:00.000Z") },
      { absenceId: "abs-1", date: new Date("2026-12-21T00:00:00.000Z") },
      { absenceId: null, date: new Date("2026-12-23T00:00:00.000Z") },
    ]);
    expect(added).toBe(1);
    expect(db.absence.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", id: { in: ["abs-1"] }, source: "TIMEWARP" },
      select: { id: true, suppressedDates: true },
    });
    expect(db.absence.update).toHaveBeenCalledWith({
      where: { id: "abs-1" },
      data: { suppressedDates: ["2026-12-21", "2026-12-22"] },
    });
  });

  it("fragt ohne verknüpfte Einträge nichts ab und schreibt nichts Unverändertes", async () => {
    const empty = dbWith([]);
    expect(
      await suppressAbsenceDays(empty as never, "user-1", [
        { absenceId: null, date: new Date("2026-12-23T00:00:00.000Z") },
      ]),
    ).toBe(0);
    expect(empty.absence.findMany).not.toHaveBeenCalled();

    const same = dbWith([{ id: "abs-1", suppressedDates: ["2026-12-21"] }]);
    await suppressAbsenceDays(same as never, "user-1", [
      { absenceId: "abs-1", date: new Date("2026-12-21T00:00:00.000Z") },
    ]);
    expect(same.absence.update).not.toHaveBeenCalled();
  });
});
