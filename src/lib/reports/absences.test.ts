import { describe, expect, it } from "vitest";
import {
  type AbsenceEntryInput,
  type AbsenceReportInput,
  buildAbsenceReport,
  dailyTargetHours,
  hoursToAbsenceDays,
  isUnpaidLeaveReason,
} from "./absences";

// Kalender 2026: 02.03. ist ein Montag, 07.03. ein Samstag, 10.10. ein Samstag.

const SETTINGS = {
  weeklyWorkHours: 40,
  workDays: [1, 2, 3, 4, 5],
  annualVacationDays: 30,
};

function input(
  overrides: Partial<AbsenceReportInput> & {
    entries?: AbsenceEntryInput[];
  } = {},
): AbsenceReportInput {
  return {
    year: 2026,
    todayKey: "2026-06-15",
    settings: SETTINGS,
    entries: [],
    reviewedDays: [],
    ...overrides,
  };
}

describe("dailyTargetHours", () => {
  it("teilt die Wochenstunden durch die Zahl der Arbeitstage", () => {
    expect(dailyTargetHours(40, [1, 2, 3, 4, 5])).toBe(8);
    expect(dailyTargetHours(32, [1, 2, 3, 4])).toBe(8);
    expect(dailyTargetHours(30, [1, 2, 3, 4, 5])).toBe(6);
  });

  it("fällt bei fehlenden Arbeitstagen oder 0 Stunden auf 8 h zurück", () => {
    expect(dailyTargetHours(40, [])).toBe(8);
    expect(dailyTargetHours(0, [1, 2, 3, 4, 5])).toBe(8);
    expect(dailyTargetHours(Number.NaN, [1])).toBe(8);
  });
});

describe("hoursToAbsenceDays", () => {
  it("rechnet auf halbe Tage, höchstens einen Tag", () => {
    expect(hoursToAbsenceDays(8, 8)).toBe(1);
    expect(hoursToAbsenceDays(4, 8)).toBe(0.5);
    expect(hoursToAbsenceDays(7, 8)).toBe(1);
    expect(hoursToAbsenceDays(24, 8)).toBe(1);
    expect(hoursToAbsenceDays(5, 8)).toBe(0.5);
  });

  it("lässt erfasste Abwesenheit nie verschwinden: mindestens ein halber Tag", () => {
    expect(hoursToAbsenceDays(1, 8)).toBe(0.5);
    expect(hoursToAbsenceDays(0.25, 8)).toBe(0.5);
  });

  it("ergibt 0 für keine oder negative Stunden", () => {
    expect(hoursToAbsenceDays(0, 8)).toBe(0);
    expect(hoursToAbsenceDays(-2, 8)).toBe(0);
  });
});

describe("isUnpaidLeaveReason", () => {
  it("erkennt „Unbezahlter Urlaub“ unabhängig von Schreibweise und Leerzeichen", () => {
    expect(isUnpaidLeaveReason("Unbezahlter Urlaub")).toBe(true);
    expect(isUnpaidLeaveReason("  unbezahlter   urlaub ")).toBe(true);
  });

  it("ignoriert andere Gründe", () => {
    expect(isUnpaidLeaveReason("Krankheit")).toBe(false);
    expect(isUnpaidLeaveReason("Feiertag")).toBe(false);
    expect(isUnpaidLeaveReason("Kein Arbeitstag")).toBe(false);
    expect(isUnpaidLeaveReason(null)).toBe(false);
    expect(isUnpaidLeaveReason("")).toBe(false);
  });
});

describe("buildAbsenceReport", () => {
  it("liefert ohne Abwesenheiten 12 leere Monate und den vollen Anspruch als Rest", () => {
    const report = buildAbsenceReport(input());
    expect(report.months).toHaveLength(12);
    expect(report.months[0].month).toBe("2026-01");
    expect(report.months[11].month).toBe("2026-12");
    expect(report.days).toEqual([]);
    expect(report.totals.days).toEqual({
      vacation: 0,
      specialLeave: 0,
      educationalLeave: 0,
      overtimeReduction: 0,
      sick: 0,
      holiday: 0,
      unpaid: 0,
    });
    expect(report.account).toEqual({
      entitlement: 30,
      taken: 0,
      planned: 0,
      remaining: 30,
      others: {
        specialLeave: { taken: 0, planned: 0 },
        educationalLeave: { taken: 0, planned: 0 },
        overtimeReduction: { taken: 0, planned: 0 },
        unpaid: { taken: 0, planned: 0 },
      },
    });
    expect(report.dailyTargetHours).toBe(8);
    expect(report.workDays).toEqual([1, 2, 3, 4, 5]);
  });

  it("summiert mehrere Einträge eines Tages vor der Umrechnung", () => {
    const report = buildAbsenceReport(
      input({
        entries: [
          { dateKey: "2026-03-02", type: "VACATION", hours: 4 },
          { dateKey: "2026-03-02", type: "VACATION", hours: 4 },
        ],
      }),
    );
    expect(report.days).toHaveLength(1);
    expect(report.days[0].days.vacation).toBe(1);
    expect(report.days[0].hours.vacation).toBe(8);
    expect(report.totals.days.vacation).toBe(1);
  });

  it("zählt halbe Urlaubstage", () => {
    const report = buildAbsenceReport(
      input({
        entries: [{ dateKey: "2026-03-03", type: "VACATION", hours: 4 }],
      }),
    );
    expect(report.account.taken).toBe(0.5);
    expect(report.account.remaining).toBe(29.5);
  });

  it("nutzt das Tagessoll aus den Einstellungen (Teilzeit)", () => {
    const report = buildAbsenceReport(
      input({
        settings: { ...SETTINGS, weeklyWorkHours: 30 },
        entries: [{ dateKey: "2026-03-02", type: "VACATION", hours: 6 }],
      }),
    );
    expect(report.dailyTargetHours).toBe(6);
    expect(report.days[0].days.vacation).toBe(1);
  });

  it("zählt Abwesenheit an Nicht-Arbeitstagen nicht, zeigt sie aber", () => {
    const report = buildAbsenceReport(
      input({
        entries: [{ dateKey: "2026-03-07", type: "VACATION", hours: 8 }],
      }),
    );
    expect(report.days).toHaveLength(1);
    expect(report.days[0].isWorkDay).toBe(false);
    expect(report.days[0].days.vacation).toBe(0);
    expect(report.days[0].hours.vacation).toBe(8);
    expect(report.totals.days.vacation).toBe(0);
    expect(report.account.taken).toBe(0);
    expect(report.nonWorkDayAbsences).toBe(1);
  });

  it("verbraucht an Feiertagen keinen Urlaub", () => {
    const report = buildAbsenceReport(
      input({
        entries: [
          { dateKey: "2026-05-01", type: "HOLIDAY", hours: 8 },
          { dateKey: "2026-05-01", type: "VACATION", hours: 8 },
        ],
      }),
    );
    const day = report.days[0];
    expect(day.days.holiday).toBe(1);
    expect(day.days.vacation).toBe(0);
    expect(day.primary).toBe("holiday");
    expect(report.account.taken).toBe(0);
  });

  it("lässt Krankheit vor Urlaub gehen, wenn beides zusammen mehr als einen Tag ergibt", () => {
    const report = buildAbsenceReport(
      input({
        entries: [
          { dateKey: "2026-03-04", type: "VACATION", hours: 8 },
          { dateKey: "2026-03-04", type: "SICK", hours: 8 },
        ],
      }),
    );
    const day = report.days[0];
    expect(day.days.sick).toBe(1);
    expect(day.days.vacation).toBe(0);
    expect(day.primary).toBe("sick");
  });

  it("erlaubt einen halben Urlaubs- und einen halben Krankheitstag", () => {
    const report = buildAbsenceReport(
      input({
        entries: [
          { dateKey: "2026-03-04", type: "VACATION", hours: 4 },
          { dateKey: "2026-03-04", type: "SICK", hours: 4 },
        ],
      }),
    );
    const day = report.days[0];
    expect(day.days.sick).toBe(0.5);
    expect(day.days.vacation).toBe(0.5);
  });

  it("trennt genommenen (bis einschließlich heute) und geplanten Urlaub", () => {
    const report = buildAbsenceReport(
      input({
        todayKey: "2026-06-15",
        entries: [
          { dateKey: "2026-03-02", type: "VACATION", hours: 8 },
          { dateKey: "2026-06-15", type: "VACATION", hours: 8 },
          { dateKey: "2026-06-16", type: "VACATION", hours: 8 },
          { dateKey: "2026-08-03", type: "VACATION", hours: 4 },
        ],
      }),
    );
    expect(report.account).toMatchObject({
      entitlement: 30,
      taken: 2,
      planned: 1.5,
      remaining: 26.5,
    });
    const june = report.months[5];
    expect(june.days.vacation).toBe(2);
    expect(june.plannedVacationDays).toBe(1);
    expect(report.days.find((d) => d.dateKey === "2026-06-16")?.isFuture).toBe(
      true,
    );
    expect(report.days.find((d) => d.dateKey === "2026-06-15")?.isFuture).toBe(
      false,
    );
  });

  it("hat in vergangenen Jahren keinen geplanten Urlaub", () => {
    const report = buildAbsenceReport(
      input({
        year: 2025,
        todayKey: "2026-10-10",
        entries: [{ dateKey: "2025-12-29", type: "VACATION", hours: 8 }],
      }),
    );
    expect(report.account.planned).toBe(0);
    expect(report.account.taken).toBe(1);
  });

  it("zeigt einen negativen Rest, wenn mehr Urlaub eingetragen ist als Anspruch", () => {
    const entries: AbsenceEntryInput[] = [
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
    ].map((dateKey) => ({ dateKey, type: "VACATION", hours: 8 }));
    const report = buildAbsenceReport(
      input({
        settings: { ...SETTINGS, annualVacationDays: 2 },
        entries,
      }),
    );
    expect(report.account.remaining).toBe(-1);
  });

  it("ignoriert Einträge außerhalb des Jahres", () => {
    const report = buildAbsenceReport(
      input({
        entries: [
          { dateKey: "2025-12-31", type: "VACATION", hours: 8 },
          { dateKey: "2027-01-04", type: "SICK", hours: 8 },
        ],
      }),
    );
    expect(report.days).toEqual([]);
  });

  it("summiert Krankheit und Feiertage je Monat in Tagen und Stunden", () => {
    const report = buildAbsenceReport(
      input({
        entries: [
          { dateKey: "2026-09-14", type: "SICK", hours: 8 },
          { dateKey: "2026-09-15", type: "SICK", hours: 3 },
          { dateKey: "2026-10-05", type: "HOLIDAY", hours: 8 },
        ],
      }),
    );
    const september = report.months[8];
    expect(september.days.sick).toBe(1.5);
    expect(september.hours.sick).toBe(11);
    expect(report.months[9].days.holiday).toBe(1);
    expect(report.totals.days).toMatchObject({
      vacation: 0,
      sick: 1.5,
      holiday: 1,
      unpaid: 0,
    });
    expect(report.totals.hours.sick).toBe(11);
  });

  describe("Urlaubskonto nach Abwesenheitsart", () => {
    const vacation = (
      dateKey: string,
      kind?: AbsenceEntryInput["kind"],
      hours = 8,
    ): AbsenceEntryInput => ({ dateKey, type: "VACATION", hours, kind });

    it("belastet das Konto mit Urlaub, Resturlaub und Einträgen ohne Abwesenheit", () => {
      const report = buildAbsenceReport(
        input({
          entries: [
            vacation("2026-03-02", "VACATION"),
            vacation("2026-03-03", "RESIDUAL_VACATION", 4),
            vacation("2026-03-04"),
            vacation("2026-03-05", null),
          ],
        }),
      );
      expect(report.totals.days.vacation).toBe(3.5);
      expect(report.account.taken).toBe(3.5);
      expect(report.account.remaining).toBe(26.5);
    });

    it("weist Sonder- und Bildungsurlaub getrennt aus, ohne das Konto zu belasten", () => {
      const report = buildAbsenceReport(
        input({
          entries: [
            vacation("2026-03-02", "SPECIAL_LEAVE"),
            vacation("2026-03-03", "EDUCATIONAL_LEAVE"),
            vacation("2026-03-04", "EDUCATIONAL_LEAVE"),
            // nach heute: geplant
            vacation("2026-07-01", "SPECIAL_LEAVE", 4),
          ],
        }),
      );
      expect(report.totals.days.vacation).toBe(0);
      expect(report.totals.days.specialLeave).toBe(1.5);
      expect(report.totals.days.educationalLeave).toBe(2);
      expect(report.totals.hours.specialLeave).toBe(12);
      expect(report.account.remaining).toBe(30);
      expect(report.account.others.specialLeave).toEqual({
        taken: 1,
        planned: 0.5,
      });
      expect(report.account.others.educationalLeave).toEqual({
        taken: 2,
        planned: 0,
      });
      expect(report.months[2].days.specialLeave).toBe(1);
      expect(report.months[6].plannedVacationDays).toBe(0);
      const day = report.days.find((d) => d.dateKey === "2026-03-02");
      expect(day?.primary).toBe("specialLeave");
    });

    it("zählt Überstundenabbau und unbezahlte Abwesenheit als eigene Zeilen", () => {
      const report = buildAbsenceReport(
        input({
          entries: [
            {
              dateKey: "2026-03-02",
              type: "OVERTIME_REDUCTION",
              hours: 8,
              kind: "OVERTIME_REDUCTION",
            },
            {
              dateKey: "2026-03-03",
              type: "UNPAID_LEAVE",
              hours: 8,
              kind: "PARENTAL_LEAVE",
            },
            { dateKey: "2026-08-03", type: "UNPAID_LEAVE", hours: 4 },
          ],
        }),
      );
      expect(report.totals.days.overtimeReduction).toBe(1);
      expect(report.totals.days.unpaid).toBe(1.5);
      expect(report.totals.hours.unpaid).toBe(12);
      expect(report.account.remaining).toBe(30);
      expect(report.account.others.overtimeReduction).toEqual({
        taken: 1,
        planned: 0,
      });
      expect(report.account.others.unpaid).toEqual({
        taken: 1,
        planned: 0.5,
      });
      expect(report.days.find((d) => d.dateKey === "2026-03-02")?.primary).toBe(
        "overtimeReduction",
      );
    });

    it("zählt einen gemischten Tag höchstens einmal (Vorrang: Krankheit vor Urlaubsarten)", () => {
      const report = buildAbsenceReport(
        input({
          entries: [
            { dateKey: "2026-03-02", type: "SICK", hours: 4 },
            vacation("2026-03-02", "VACATION", 4),
            vacation("2026-03-02", "SPECIAL_LEAVE", 4),
            {
              dateKey: "2026-03-02",
              type: "OVERTIME_REDUCTION",
              hours: 4,
            },
          ],
        }),
      );
      const day = report.days.find((d) => d.dateKey === "2026-03-02");
      expect(day?.days).toMatchObject({
        sick: 0.5,
        vacation: 0.5,
        specialLeave: 0,
        overtimeReduction: 0,
      });
      expect(report.account.taken).toBe(0.5);
    });

    it("zählt einen geprüften „Unbezahlten Urlaub“ nicht zusätzlich zum Eintrag", () => {
      const report = buildAbsenceReport(
        input({
          entries: [{ dateKey: "2026-03-03", type: "UNPAID_LEAVE", hours: 8 }],
          reviewedDays: [
            { dateKey: "2026-03-03", reason: "Unbezahlter Urlaub" },
          ],
        }),
      );
      expect(report.totals.days.unpaid).toBe(1);
    });
  });

  describe("unbezahlter Urlaub aus geprüften Tagen", () => {
    it("zählt „Unbezahlter Urlaub“ als eigene Kategorie, ohne den Urlaubsanspruch zu verringern", () => {
      const report = buildAbsenceReport(
        input({
          reviewedDays: [
            { dateKey: "2026-04-07", reason: "Unbezahlter Urlaub" },
            { dateKey: "2026-04-08", reason: "unbezahlter urlaub" },
          ],
        }),
      );
      expect(report.totals.days.unpaid).toBe(2);
      expect(report.months[3].days.unpaid).toBe(2);
      expect(report.account.remaining).toBe(30);
      const day = report.days.find((d) => d.dateKey === "2026-04-07");
      expect(day?.primary).toBe("unpaid");
      expect(day?.days.unpaid).toBe(1);
      expect(day?.hours.unpaid).toBe(0);
    });

    it("zählt nicht an Tagen, an denen später doch gearbeitet wurde", () => {
      const report = buildAbsenceReport(
        input({
          reviewedDays: [
            { dateKey: "2026-04-07", reason: "Unbezahlter Urlaub" },
            { dateKey: "2026-04-08", reason: "Unbezahlter Urlaub" },
          ],
          workedDateKeys: ["2026-04-08"],
        }),
      );
      expect(report.totals.days.unpaid).toBe(1);
      expect(report.days.map((d) => d.dateKey)).toEqual(["2026-04-07"]);
    });

    it("ignoriert andere Gründe wie Krankheit oder Feiertag", () => {
      const report = buildAbsenceReport(
        input({
          reviewedDays: [
            { dateKey: "2026-04-07", reason: "Krankheit" },
            { dateKey: "2026-04-08", reason: "Feiertag" },
            { dateKey: "2026-04-09", reason: null },
          ],
        }),
      );
      expect(report.days).toEqual([]);
      expect(report.totals.days.sick).toBe(0);
    });

    it("zählt nicht an Nicht-Arbeitstagen oder wenn am Tag schon eine Abwesenheit erfasst ist", () => {
      const report = buildAbsenceReport(
        input({
          entries: [{ dateKey: "2026-04-08", type: "VACATION", hours: 8 }],
          reviewedDays: [
            { dateKey: "2026-04-11", reason: "Unbezahlter Urlaub" },
            { dateKey: "2026-04-08", reason: "Unbezahlter Urlaub" },
          ],
        }),
      );
      expect(report.totals.days.unpaid).toBe(0);
      expect(report.totals.days.vacation).toBe(1);
      expect(report.days.map((d) => d.dateKey)).toEqual(["2026-04-08"]);
    });
  });

  it("sortiert die Tage aufsteigend", () => {
    const report = buildAbsenceReport(
      input({
        entries: [
          { dateKey: "2026-09-14", type: "SICK", hours: 8 },
          { dateKey: "2026-02-02", type: "VACATION", hours: 8 },
        ],
        reviewedDays: [{ dateKey: "2026-05-05", reason: "Unbezahlter Urlaub" }],
      }),
    );
    expect(report.days.map((d) => d.dateKey)).toEqual([
      "2026-02-02",
      "2026-05-05",
      "2026-09-14",
    ]);
  });

  it("übernimmt halbe Tage beim Anspruch", () => {
    const report = buildAbsenceReport(
      input({
        settings: { ...SETTINGS, annualVacationDays: 27.5 },
        entries: [{ dateKey: "2026-03-02", type: "VACATION", hours: 8 }],
      }),
    );
    expect(report.account.remaining).toBe(26.5);
  });

  describe("offizielle Feiertage", () => {
    const holidays = {
      "2026-01-01": "Neujahr",
      "2026-04-03": "Karfreitag",
      "2026-10-03": "Tag der Deutschen Einheit", // Samstag
      "2026-12-25": "1. Weihnachtstag",
    };

    it("zählt offizielle Feiertage an Arbeitstagen auch ohne Import", () => {
      const report = buildAbsenceReport(input({ holidays }));
      expect(report.totals.days.holiday).toBe(3);
      expect(report.months[0].days.holiday).toBe(1);
      const newYear = report.days.find((d) => d.dateKey === "2026-01-01");
      expect(newYear).toMatchObject({
        primary: "holiday",
        holidayName: "Neujahr",
        holidayImported: false,
        days: { holiday: 1, vacation: 0, sick: 0, unpaid: 0 },
      });
      // Samstag: kein Arbeitstag, erscheint nicht und zählt nicht
      expect(report.days.some((d) => d.dateKey === "2026-10-03")).toBe(false);
      expect(report.nonWorkDayAbsences).toBe(0);
    });

    it("zählt importierte Feiertage nicht doppelt", () => {
      const report = buildAbsenceReport(
        input({
          holidays,
          entries: [{ dateKey: "2026-01-01", type: "HOLIDAY", hours: 8 }],
        }),
      );
      expect(report.totals.days.holiday).toBe(3);
      const newYear = report.days.find((d) => d.dateKey === "2026-01-01");
      expect(newYear).toMatchObject({
        holidayName: "Neujahr",
        holidayImported: true,
      });
    });

    it("verbraucht an offiziellen Feiertagen keinen Urlaub", () => {
      const report = buildAbsenceReport(
        input({
          holidays,
          entries: [{ dateKey: "2026-12-25", type: "VACATION", hours: 8 }],
        }),
      );
      const christmas = report.days.find((d) => d.dateKey === "2026-12-25");
      expect(christmas?.days).toMatchObject({
        vacation: 0,
        sick: 0,
        holiday: 1,
        unpaid: 0,
      });
      expect(report.account.planned).toBe(0);
    });
  });
});
