import { describe, expect, it } from "vitest";
import type { AbsenceDay } from "@/lib/reports/absences";
import {
  describeAbsenceDay,
  formatDayCount,
  formatDays,
  formatWorkDays,
} from "./absence-style";

function day(overrides: Partial<AbsenceDay>): AbsenceDay {
  return {
    dateKey: "2026-08-03",
    isWorkDay: true,
    isFuture: false,
    hours: { vacation: 0, sick: 0, holiday: 0, unpaid: 0 },
    days: { vacation: 0, sick: 0, holiday: 0, unpaid: 0 },
    primary: "vacation",
    ...overrides,
  };
}

describe("formatDays", () => {
  it("nutzt Singular nur für genau einen Tag", () => {
    expect(formatDays(1)).toBe("1 Tag");
    expect(formatDays(0)).toBe("0 Tage");
    expect(formatDays(2.5)).toBe("2,5 Tage");
    expect(formatDays(0.5)).toBe("0,5 Tage");
  });

  it("schreibt negative Werte mit echtem Minus", () => {
    expect(formatDays(-1)).toBe("−1 Tag");
    expect(formatDays(-3.5)).toBe("−3,5 Tage");
  });
});

describe("formatDayCount", () => {
  it("zeigt 0 als Strich", () => {
    expect(formatDayCount(0)).toBe("—");
    expect(formatDayCount(1.5)).toBe("1,5");
  });
});

describe("formatWorkDays", () => {
  it("fasst zusammenhängende Tage als Spanne zusammen", () => {
    expect(formatWorkDays([1, 2, 3, 4, 5])).toBe("Mo–Fr");
    expect(formatWorkDays([5, 4, 3, 2, 1, 6])).toBe("Mo–Sa");
  });

  it("listet lückenhafte oder kurze Wochen einzeln", () => {
    expect(formatWorkDays([1, 3, 5])).toBe("Mo, Mi, Fr");
    expect(formatWorkDays([1, 2])).toBe("Mo, Di");
    expect(formatWorkDays([0, 1])).toBe("Mo, So");
    expect(formatWorkDays([])).toBe("keine");
  });
});

describe("describeAbsenceDay", () => {
  it("beschreibt einen geplanten Urlaubstag", () => {
    expect(
      describeAbsenceDay(
        day({
          isFuture: true,
          hours: { vacation: 8, sick: 0, holiday: 0, unpaid: 0 },
          days: { vacation: 1, sick: 0, holiday: 0, unpaid: 0 },
        }),
      ),
    ).toBe("Mo 03.08. · Urlaub 8:00 h · geplant · zählt 1 Tag");
  });

  it("nennt offizielle Feiertage ohne Import mit Namen", () => {
    expect(
      describeAbsenceDay(
        day({
          dateKey: "2026-12-25",
          days: { vacation: 0, sick: 0, holiday: 1, unpaid: 0 },
          primary: "holiday",
          holidayName: "1. Weihnachtstag",
          holidayImported: false,
        }),
      ),
    ).toBe(
      "Fr 25.12. · Feiertag (1. Weihnachtstag), nicht importiert · zählt 1 Tag",
    );
  });

  it("nennt beide Kategorien bei geteilten Tagen", () => {
    expect(
      describeAbsenceDay(
        day({
          hours: { vacation: 4, sick: 4, holiday: 0, unpaid: 0 },
          days: { vacation: 0.5, sick: 0.5, holiday: 0, unpaid: 0 },
          primary: "sick",
        }),
      ),
    ).toBe(
      "Mo 03.08. · Urlaub 4:00 h · Krankheit 4:00 h · zählt 0,5 Tage Urlaub + 0,5 Tage Krankheit",
    );
  });

  it("markiert Nicht-Arbeitstage und unbezahlten Urlaub", () => {
    expect(
      describeAbsenceDay(
        day({
          dateKey: "2026-08-08",
          isWorkDay: false,
          hours: { vacation: 8, sick: 0, holiday: 0, unpaid: 0 },
        }),
      ),
    ).toBe("Sa 08.08. · Urlaub 8:00 h · kein Arbeitstag, nicht gezählt");
    expect(
      describeAbsenceDay(
        day({
          days: { vacation: 0, sick: 0, holiday: 0, unpaid: 1 },
          primary: "unpaid",
        }),
      ),
    ).toBe("Mo 03.08. · Unbezahlter Urlaub (geprüfter Tag) · zählt 1 Tag");
  });
});
