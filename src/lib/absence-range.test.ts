import { describe, expect, it } from "vitest";
import {
  type AbsencePlanInput,
  absenceDescription,
  berlinWallClock,
  countDaysInclusive,
  MAX_ABSENCE_RANGE_DAYS,
  planAbsenceRange,
  validateAbsenceRange,
} from "./absence-range";
import { hoursToAbsenceDays } from "./reports/absences";

// Kalender 2026: 05.10. ist ein Montag, 10.10. ein Samstag, 25.10. Ende der
// Sommerzeit, 29.03. Beginn der Sommerzeit; 01.01.2027 ist ein Freitag.

function input(overrides: Partial<AbsencePlanInput> = {}): AbsencePlanInput {
  return {
    from: "2026-10-05",
    to: "2026-10-09",
    halfDay: false,
    workDays: [1, 2, 3, 4, 5],
    dailyHours: 8,
    officialHolidays: {},
    existingEntries: [],
    ...overrides,
  };
}

describe("berlinWallClock", () => {
  it("rechnet Berliner Ortszeit in Sommer- und Winterzeit in UTC um", () => {
    expect(berlinWallClock("2026-07-01", 9).toISOString()).toBe(
      "2026-07-01T07:00:00.000Z",
    );
    expect(berlinWallClock("2026-01-15", 9, 30).toISOString()).toBe(
      "2026-01-15T08:30:00.000Z",
    );
  });

  it("trifft die Tage direkt um die Zeitumstellung", () => {
    expect(berlinWallClock("2026-03-27", 9).toISOString()).toBe(
      "2026-03-27T08:00:00.000Z",
    );
    expect(berlinWallClock("2026-03-30", 9).toISOString()).toBe(
      "2026-03-30T07:00:00.000Z",
    );
    expect(berlinWallClock("2026-10-23", 9).toISOString()).toBe(
      "2026-10-23T07:00:00.000Z",
    );
    expect(berlinWallClock("2026-10-26", 9).toISOString()).toBe(
      "2026-10-26T08:00:00.000Z",
    );
  });
});

describe("countDaysInclusive", () => {
  it("zählt beide Enden mit, auch über Zeitumstellung und Jahreswechsel", () => {
    expect(countDaysInclusive("2026-10-05", "2026-10-05")).toBe(1);
    expect(countDaysInclusive("2026-10-24", "2026-10-26")).toBe(3);
    expect(countDaysInclusive("2026-12-28", "2027-01-04")).toBe(8);
    expect(countDaysInclusive("2028-01-01", "2028-12-31")).toBe(366);
  });
});

describe("validateAbsenceRange", () => {
  it("akzeptiert gültige Zeiträume, auch in der Zukunft", () => {
    expect(
      validateAbsenceRange({
        from: "2027-07-01",
        to: "2027-07-14",
        halfDay: false,
      }),
    ).toBeNull();
    expect(
      validateAbsenceRange({
        from: "2027-07-01",
        to: "2027-07-01",
        halfDay: true,
      }),
    ).toBeNull();
  });

  it("lehnt ungültige Daten und umgedrehte Zeiträume ab", () => {
    expect(
      validateAbsenceRange({
        from: "2026-02-30",
        to: "2026-03-01",
        halfDay: false,
      }),
    ).toMatch(/Datum/);
    expect(
      validateAbsenceRange({
        from: "2026-10-09",
        to: "2026-10-05",
        halfDay: false,
      }),
    ).toMatch(/vor/);
  });

  it("erlaubt nur Jahre von 2000 bis 2100", () => {
    expect(
      validateAbsenceRange({
        from: "1999-12-31",
        to: "2000-01-02",
        halfDay: false,
      }),
    ).toMatch(/2000/);
    expect(
      validateAbsenceRange({
        from: "2100-12-30",
        to: "2101-01-02",
        halfDay: false,
      }),
    ).toMatch(/2100/);
  });

  it("begrenzt den Zeitraum auf ein Jahr", () => {
    expect(
      validateAbsenceRange({
        from: "2028-01-01",
        to: "2028-12-31",
        halfDay: false,
      }),
    ).toBeNull();
    expect(
      validateAbsenceRange({
        from: "2026-01-01",
        to: "2027-01-02",
        halfDay: false,
      }),
    ).toMatch(String(MAX_ABSENCE_RANGE_DAYS));
  });

  it("erlaubt einen halben Tag nur für genau einen Tag", () => {
    expect(
      validateAbsenceRange({
        from: "2026-10-05",
        to: "2026-10-06",
        halfDay: true,
      }),
    ).toMatch(/halbe/i);
  });
});

describe("planAbsenceRange", () => {
  it("legt je Arbeitstag einen Eintrag mit Tagessoll ab 09:00 Berliner Zeit an", () => {
    const plan = planAbsenceRange(input());
    expect(plan.days.map((d) => d.date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
    ]);
    expect(plan.days.every((d) => d.hours === 8)).toBe(true);
    expect(plan.totalHours).toBe(40);
    expect(plan.skipped).toEqual([]);
    expect(plan.nonWorkDays).toBe(0);
    expect(plan.days[0].startTime.toISOString()).toBe(
      "2026-10-05T07:00:00.000Z",
    );
    expect(plan.days[0].endTime.toISOString()).toBe("2026-10-05T15:00:00.000Z");
  });

  it("überspringt Wochenenden und zählt sie nur", () => {
    const plan = planAbsenceRange(
      input({ from: "2026-10-09", to: "2026-10-12" }),
    );
    expect(plan.days.map((d) => d.date)).toEqual(["2026-10-09", "2026-10-12"]);
    expect(plan.nonWorkDays).toBe(2);
    expect(plan.skipped).toEqual([]);
  });

  it("richtet sich nach den Arbeitstagen aus den Einstellungen", () => {
    // Vier-Tage-Woche Mo–Do mit 32 h: Tagessoll 8 h, Freitag kein Arbeitstag
    const plan = planAbsenceRange(input({ workDays: [1, 2, 3, 4] }));
    expect(plan.days).toHaveLength(4);
    expect(plan.nonWorkDays).toBe(1);
  });

  it("überspringt offizielle und importierte Feiertage mit Namen", () => {
    const plan = planAbsenceRange(
      input({
        from: "2026-09-28",
        to: "2026-10-09",
        officialHolidays: { "2026-10-03": "Tag der Deutschen Einheit" },
        existingEntries: [
          { date: "2026-10-06", type: "HOLIDAY", description: "Betriebsfeier" },
        ],
      }),
    );
    // 03.10.2026 ist ein Samstag → zählt als Nicht-Arbeitstag, nicht als Feiertag
    expect(plan.skipped).toEqual([
      { date: "2026-10-06", reason: "holiday", label: "Betriebsfeier" },
    ]);
    expect(plan.days).toHaveLength(9);
    expect(plan.nonWorkDays).toBe(2);
  });

  it("überspringt Tage mit vorhandenem Urlaub oder Krankheit", () => {
    const plan = planAbsenceRange(
      input({
        existingEntries: [
          { date: "2026-10-06", type: "VACATION", description: "Urlaub" },
          { date: "2026-10-07", type: "SICK", description: null },
          { date: "2026-10-08", type: "WORK", description: "Projekt" },
        ],
      }),
    );
    expect(plan.days.map((d) => d.date)).toEqual([
      "2026-10-05",
      "2026-10-08",
      "2026-10-09",
    ]);
    expect(plan.skipped).toEqual([
      { date: "2026-10-06", reason: "existing", label: "Urlaub" },
      { date: "2026-10-07", reason: "existing", label: "Krankheit" },
    ]);
    expect(plan.totalHours).toBe(24);
  });

  it("legt einen halben Tag mit halbem Tagessoll an, der als halber Urlaubstag zählt", () => {
    const plan = planAbsenceRange(
      input({
        from: "2026-10-05",
        to: "2026-10-05",
        halfDay: true,
        dailyHours: 7.7,
      }),
    );
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].hours).toBe(3.85);
    expect(plan.days[0].endTime.toISOString()).toBe("2026-10-05T10:51:00.000Z");
    expect(hoursToAbsenceDays(plan.days[0].hours, 7.7)).toBe(0.5);
  });

  it("rundet ein krummes Tagessoll auf zwei Nachkommastellen", () => {
    const plan = planAbsenceRange(
      input({ workDays: [1, 2, 3, 4, 5, 6], dailyHours: 40 / 6 }),
    );
    expect(plan.days[0].hours).toBe(6.67);
  });

  it("läuft über den Jahreswechsel und überspringt Neujahr", () => {
    const plan = planAbsenceRange(
      input({
        from: "2026-12-28",
        to: "2027-01-04",
        officialHolidays: { "2027-01-01": "Neujahr" },
      }),
    );
    expect(plan.days.map((d) => d.date)).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-04",
    ]);
    expect(plan.skipped).toEqual([
      { date: "2027-01-01", reason: "holiday", label: "Neujahr" },
    ]);
    expect(plan.nonWorkDays).toBe(2);
  });

  it("setzt die Zeiten um die Zeitumstellung korrekt", () => {
    const plan = planAbsenceRange(
      input({ from: "2026-10-23", to: "2026-10-26" }),
    );
    expect(
      plan.days.map((d) => [
        d.date,
        d.startTime.toISOString(),
        d.endTime.toISOString(),
      ]),
    ).toEqual([
      ["2026-10-23", "2026-10-23T07:00:00.000Z", "2026-10-23T15:00:00.000Z"],
      ["2026-10-26", "2026-10-26T08:00:00.000Z", "2026-10-26T16:00:00.000Z"],
    ]);
  });
});

describe("absenceDescription", () => {
  it("nutzt die Bezeichnung wie der Timing-Import, optional mit Notiz", () => {
    expect(absenceDescription("VACATION")).toBe("Urlaub");
    expect(absenceDescription("SICK", "  ")).toBe("Krankheit");
    expect(absenceDescription("VACATION", "Ostsee")).toBe("Urlaub - Ostsee");
  });
});
