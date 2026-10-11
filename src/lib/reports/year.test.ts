import { describe, expect, it } from "vitest";
import {
  buildYearReport,
  dateKeysBetween,
  dayTargetHours,
  isAbsence,
  isLeave,
  type ReportEntry,
  roundToQuarterHour,
  summarizeRange,
  type WorkSchedule,
} from "./year";

const MON_FRI: WorkSchedule = { workDays: [1, 2, 3, 4, 5], dailyHours: 8 };
const MON_THU: WorkSchedule = { workDays: [1, 2, 3, 4], dailyHours: 8 };
const NO_HOLIDAYS: ReadonlySet<string> = new Set();

function work(
  date: string,
  hours: number,
  extra: Partial<ReportEntry> = {},
): ReportEntry {
  return {
    date,
    hours,
    type: "WORK",
    source: "TIMING_SYNC",
    billingStatus: null,
    ...extra,
  };
}

function absence(
  date: string,
  type: "VACATION" | "SICK" | "OVERTIME_REDUCTION" | "UNPAID_LEAVE",
  hours = 8,
): ReportEntry {
  return { date, hours, type, source: "MANUAL", billingStatus: null };
}

/** WORK-Einträge an allen Mo–Fr eines Zeitraums, außer den ausgelassenen Tagen. */
function workEveryWeekday(
  from: string,
  to: string,
  hours: number,
  skip: string[] = [],
): ReportEntry[] {
  return dateKeysBetween(from, to)
    .filter((key) => {
      const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
      return weekday >= 1 && weekday <= 5 && !skip.includes(key);
    })
    .map((key) => work(key, hours));
}

describe("roundToQuarterHour", () => {
  it("rundet wie der Überstunden-Saldo auf Viertelstunden", () => {
    expect(roundToQuarterHour(8.1)).toBe(8);
    expect(roundToQuarterHour(4.13)).toBe(4.25);
    expect(roundToQuarterHour(0.12)).toBe(0);
  });
});

describe("dateKeysBetween", () => {
  it("liefert alle Tage inklusive Start und Ende", () => {
    expect(dateKeysBetween("2026-02-27", "2026-03-02")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  it("ist leer, wenn der Start nach dem Ende liegt", () => {
    expect(dateKeysBetween("2026-03-02", "2026-03-01")).toEqual([]);
  });
});

describe("summarizeRange", () => {
  it("rechnet Soll ohne Feiertage und schreibt Urlaub als Tagessoll gut", () => {
    // Mo 02.03. bis So 08.03.2026, Do ist Feiertag
    const entries: ReportEntry[] = [
      work("2026-03-02", 8.1),
      work("2026-03-03", 9),
      absence("2026-03-04", "VACATION"),
      work("2026-03-06", 4),
      work("2026-03-06", 4.13),
      work("2026-03-07", 2), // Samstagsarbeit zählt zum Ist
    ];
    const summary = summarizeRange(entries, {
      from: "2026-03-02",
      to: "2026-03-08",
      schedule: MON_FRI,
      holidayKeys: new Set(["2026-03-05"]),
    });
    expect(summary.workDays).toBe(5);
    expect(summary.holidayDays).toBe(1);
    expect(summary.absenceDays).toBe(1);
    expect(summary.targetHours).toBe(32);
    expect(summary.workHours).toBe(27.25);
    expect(summary.actualHours).toBe(35.25);
  });

  it("zählt Urlaub mehrfach am selben Tag nur einmal", () => {
    const summary = summarizeRange(
      [absence("2026-03-02", "VACATION"), absence("2026-03-02", "VACATION")],
      {
        from: "2026-03-02",
        to: "2026-03-02",
        schedule: MON_FRI,
        holidayKeys: NO_HOLIDAYS,
      },
    );
    expect(summary.actualHours).toBe(8);
    expect(summary.absenceDays).toBe(1);
  });

  it("berücksichtigt die konfigurierten Arbeitstage (4-Tage-Woche)", () => {
    // Fr 06.03. ist kein Arbeitstag: Feiertag und Urlaub dort ändern nichts
    const summary = summarizeRange(
      [absence("2026-03-06", "VACATION"), work("2026-03-02", 8)],
      {
        from: "2026-03-02",
        to: "2026-03-08",
        schedule: MON_THU,
        holidayKeys: new Set(["2026-03-06"]),
      },
    );
    expect(summary.workDays).toBe(4);
    expect(summary.holidayDays).toBe(0);
    expect(summary.absenceDays).toBe(0);
    expect(summary.targetHours).toBe(32);
    expect(summary.actualHours).toBe(8);
  });

  it("teilt Arbeit nach Abrechnungsstatus auf und ignoriert Abwesenheiten", () => {
    const summary = summarizeRange(
      [
        work("2026-03-02", 3, { billingStatus: "billable" }),
        work("2026-03-02", 2, { billingStatus: "paid" }),
        work("2026-03-03", 1.5, { billingStatus: "not_billable" }),
        work("2026-03-03", 1, { billingStatus: null }),
        work("2026-03-03", 4, { source: "ADJUSTMENT", type: "OVERTIME" }),
        absence("2026-03-04", "SICK"),
      ],
      {
        from: "2026-03-02",
        to: "2026-03-06",
        schedule: MON_FRI,
        holidayKeys: NO_HOLIDAYS,
      },
    );
    expect(summary.billableHours).toBe(5);
    expect(summary.nonBillableHours).toBe(1.5);
    expect(summary.unknownBillingHours).toBe(1);
    // Anfangssaldo zählt nicht als Arbeit
    expect(summary.workHours).toBe(7.5);
  });
});

describe("summarizeRange (Urlaub/Krank je Tag)", () => {
  const oneDay = (entries: ReportEntry[], holidayKeys = NO_HOLIDAYS) =>
    summarizeRange(entries, {
      from: "2026-03-02",
      to: "2026-03-02",
      schedule: MON_FRI,
      holidayKeys,
    });

  it("schreibt einen halben Urlaubstag mit seinen Stunden gut", () => {
    const summary = oneDay([
      absence("2026-03-02", "VACATION", 4),
      work("2026-03-02", 4),
    ]);
    expect(summary.targetHours).toBe(8);
    expect(summary.actualHours).toBe(8);
    expect(summary.absenceDays).toBe(0.5);
  });

  it("summiert Urlaub und Krankheit eines Tags, höchstens bis zum Tagessoll", () => {
    const summary = oneDay([
      absence("2026-03-02", "VACATION", 6),
      absence("2026-03-02", "SICK", 6),
    ]);
    expect(summary.actualHours).toBe(8);
    expect(summary.absenceDays).toBe(1);
  });

  it("schreibt an Feiertagen nichts gut", () => {
    const summary = oneDay(
      [absence("2026-03-02", "VACATION")],
      new Set(["2026-03-02"]),
    );
    expect(summary.targetHours).toBe(0);
    expect(summary.actualHours).toBe(0);
    expect(summary.absenceDays).toBe(0);
  });

  it("wertet einen 0-h-Eintrag nicht als ganzen Tag", () => {
    const summary = oneDay([absence("2026-03-02", "VACATION", 0)]);
    expect(summary.actualHours).toBe(0);
    expect(summary.absenceDays).toBe(0);
  });

  it("schreibt bei krummem Tagessoll das volle Soll gut (39 h → 7,8 h)", () => {
    // Der Dialog legt 7,8 h an; Viertelstunden-Rundung (7,75 h) ließe pro
    // Urlaubstag 3 Minuten Minus stehen
    const week = summarizeRange(
      [
        "2026-03-02",
        "2026-03-03",
        "2026-03-04",
        "2026-03-05",
        "2026-03-06",
      ].map((date) => absence(date, "VACATION", 7.8)),
      {
        from: "2026-03-02",
        to: "2026-03-06",
        schedule: { workDays: [1, 2, 3, 4, 5], dailyHours: 7.8 },
        holidayKeys: NO_HOLIDAYS,
      },
    );
    expect(week.actualHours).toBeCloseTo(week.targetHours, 9);
  });

  it("zählt Abwesenheitstage wie der Abwesenheiten-Bericht", () => {
    // 3 h → ½ Tag (gerundet), Gutschrift bleibt 3 h
    const summary = oneDay([absence("2026-03-02", "SICK", 3)]);
    expect(summary.actualHours).toBe(3);
    expect(summary.absenceDays).toBe(0.5);
  });
});

describe("summarizeRange (Überstundenabbau und unbezahlte Abwesenheit)", () => {
  const oneDay = (entries: ReportEntry[], holidayKeys = NO_HOLIDAYS) =>
    summarizeRange(entries, {
      from: "2026-03-02",
      to: "2026-03-02",
      schedule: MON_FRI,
      holidayKeys,
    });

  it("Überstundenabbau: Soll bleibt, keine Gutschrift, keine Arbeit", () => {
    const summary = oneDay([absence("2026-03-02", "OVERTIME_REDUCTION")]);
    expect(summary.targetHours).toBe(8);
    expect(summary.actualHours).toBe(0);
    expect(summary.workHours).toBe(0);
    expect(summary.absenceDays).toBe(0);
    expect(summary.overtimeReductionDays).toBe(1);
  });

  it("halber Überstundenabbau mit halbem Tag Arbeit: Saldo −4 h", () => {
    const summary = oneDay([
      absence("2026-03-02", "OVERTIME_REDUCTION", 4),
      work("2026-03-02", 4),
    ]);
    expect(summary.actualHours - summary.targetHours).toBe(-4);
    expect(summary.overtimeReductionDays).toBe(0.5);
  });

  it("unbezahlte Abwesenheit setzt das Tagessoll auf 0, ohne Gutschrift", () => {
    const summary = oneDay([absence("2026-03-02", "UNPAID_LEAVE")]);
    expect(summary.targetHours).toBe(0);
    expect(summary.actualHours).toBe(0);
    expect(summary.absenceDays).toBe(0);
    expect(summary.unpaidDays).toBe(1);
    // Der Arbeitstag zählt weiter mit (wie bei Urlaub)
    expect(summary.workDays).toBe(1);
  });

  it("halber unbezahlter Tag halbiert das Soll", () => {
    const summary = oneDay([
      absence("2026-03-02", "UNPAID_LEAVE", 4),
      work("2026-03-02", 4),
    ]);
    expect(summary.targetHours).toBe(4);
    expect(summary.actualHours).toBe(4);
    expect(summary.unpaidDays).toBe(0.5);
  });

  it("Urlaub am Tag mit unbezahlter Abwesenheit: Gutschrift höchstens bis zum verbleibenden Soll", () => {
    const half = oneDay([
      absence("2026-03-02", "UNPAID_LEAVE", 4),
      absence("2026-03-02", "VACATION", 8),
    ]);
    expect(half.targetHours).toBe(4);
    expect(half.actualHours).toBe(4);

    const full = oneDay([
      absence("2026-03-02", "UNPAID_LEAVE", 8),
      absence("2026-03-02", "VACATION", 8),
    ]);
    expect(full.targetHours).toBe(0);
    expect(full.actualHours).toBe(0);
    expect(full.absenceDays).toBe(0);
  });

  it("Arbeit an einem unbezahlten Tag zählt als Plus", () => {
    const summary = oneDay([
      absence("2026-03-02", "UNPAID_LEAVE"),
      work("2026-03-02", 2),
    ]);
    expect(summary.actualHours - summary.targetHours).toBe(2);
  });

  it("an Feiertagen und freien Tagen ändert sich nichts", () => {
    const holiday = oneDay(
      [absence("2026-03-02", "UNPAID_LEAVE")],
      new Set(["2026-03-02"]),
    );
    expect(holiday.targetHours).toBe(0);
    expect(holiday.unpaidDays).toBe(0);

    const saturday = summarizeRange(
      [absence("2026-03-07", "OVERTIME_REDUCTION")],
      {
        from: "2026-03-07",
        to: "2026-03-07",
        schedule: MON_FRI,
        holidayKeys: NO_HOLIDAYS,
      },
    );
    expect(saturday.targetHours).toBe(0);
    expect(saturday.actualHours).toBe(0);
    expect(saturday.overtimeReductionDays).toBe(0);
  });

  it("ignoriert 0-h-Einträge", () => {
    const summary = oneDay([absence("2026-03-02", "UNPAID_LEAVE", 0)]);
    expect(summary.targetHours).toBe(8);
    expect(summary.unpaidDays).toBe(0);
  });
});

describe("dayTargetHours", () => {
  it("mindert das Soll um unbezahlte Stunden, höchstens bis 0", () => {
    expect(dayTargetHours("2026-03-02", MON_FRI, NO_HOLIDAYS)).toBe(8);
    expect(dayTargetHours("2026-03-02", MON_FRI, NO_HOLIDAYS, 4)).toBe(4);
    expect(dayTargetHours("2026-03-02", MON_FRI, NO_HOLIDAYS, 10)).toBe(0);
    expect(dayTargetHours("2026-03-07", MON_FRI, NO_HOLIDAYS, 4)).toBe(0);
  });
});

describe("isAbsence / isLeave", () => {
  it("Gutschrift nur für Urlaub und Krankheit, frei sind alle vier Arten", () => {
    for (const type of ["VACATION", "SICK"] as const) {
      expect(isAbsence(absence("2026-03-02", type))).toBe(true);
      expect(isLeave(absence("2026-03-02", type))).toBe(true);
    }
    for (const type of ["OVERTIME_REDUCTION", "UNPAID_LEAVE"] as const) {
      expect(isAbsence(absence("2026-03-02", type))).toBe(false);
      expect(isLeave(absence("2026-03-02", type))).toBe(true);
    }
    expect(isLeave(work("2026-03-02", 8))).toBe(false);
  });
});

describe("buildYearReport", () => {
  const trackingStart = "2026-08-03";
  const entries: ReportEntry[] = [
    // Aug ab 03.08.: 21 Arbeitstage à 8,5 h → +10,5
    ...workEveryWeekday("2026-08-03", "2026-08-31", 8.5),
    // Sep: 22 Arbeitstage, 15.09. fehlt → −8
    ...workEveryWeekday("2026-09-01", "2026-09-30", 8, ["2026-09-15"]),
    // Okt bis heute (Sa 10.10.): 7 Arbeitstage à 8 h → ±0
    ...workEveryWeekday("2026-10-01", "2026-10-10", 8),
  ];

  const report = buildYearReport({
    year: 2026,
    todayKey: "2026-10-10",
    entries,
    schedule: MON_FRI,
    holidayKeys: NO_HOLIDAYS,
    trackingStart,
    initialBalance: 5,
  });

  it("markiert Monate vor Erfassungsbeginn und in der Zukunft", () => {
    expect(report.months.map((m) => m.status)).toEqual([
      "untracked",
      "untracked",
      "untracked",
      "untracked",
      "untracked",
      "untracked",
      "untracked",
      "closed",
      "closed",
      "current",
      "future",
      "future",
    ]);
  });

  it("zählt im Startmonat erst ab dem Erfassungsbeginn", () => {
    const aug = report.months[7];
    expect(aug.from).toBe("2026-08-03");
    expect(aug.targetHours).toBe(168);
    expect(aug.actualHours).toBe(178.5);
    expect(aug.deltaHours).toBe(10.5);
  });

  it("führt den Saldo ab dem Anfangssaldo kumuliert fort", () => {
    expect(report.openingBalance).toBe(5);
    expect(report.months[6].balanceHours).toBeNull();
    expect(report.months[7].balanceHours).toBe(15.5);
    expect(report.months[8].balanceHours).toBe(7.5);
    expect(report.months[9].balanceHours).toBe(7.5);
    expect(report.months[9].to).toBe("2026-10-10");
    expect(report.months[10].balanceHours).toBeNull();
    expect(report.closingBalance).toBe(7.5);
  });

  it("fasst Quartale mit Status zusammen", () => {
    expect(report.quarters.map((q) => q.status)).toEqual([
      "untracked",
      "untracked",
      "closed",
      "current",
    ]);
    const q3 = report.quarters[2];
    expect(q3.targetHours).toBe(168 + 176);
    expect(q3.actualHours).toBe(178.5 + 168);
    expect(q3.deltaHours).toBe(2.5);
    expect(q3.balanceHours).toBe(7.5);
    expect(report.totals.deltaHours).toBe(2.5);
  });

  it("übernimmt den Saldo aus dem Vorjahr als Eröffnungssaldo", () => {
    const next = buildYearReport({
      year: 2027,
      todayKey: "2027-01-05",
      entries: [
        ...workEveryWeekday("2026-12-28", "2026-12-31", 9),
        ...workEveryWeekday("2027-01-01", "2027-01-05", 8, ["2027-01-01"]),
      ],
      schedule: MON_FRI,
      // 01.01.2027 (Fr) ist Feiertag
      holidayKeys: new Set(["2027-01-01"]),
      trackingStart: "2026-12-28",
      initialBalance: 0,
    });
    expect(next.openingBalance).toBe(4);
    const jan = next.months[0];
    expect(jan.status).toBe("current");
    expect(jan.holidayDays).toBe(1);
    // 04. und 05.01. à 8 h, Soll 16 h; der Feiertag wurde nicht gearbeitet
    expect(jan.targetHours).toBe(16);
    expect(jan.actualHours).toBe(16);
    expect(next.closingBalance).toBe(4);
  });

  it("liefert ohne Erfassungsbeginn keine gezählten Monate", () => {
    const empty = buildYearReport({
      year: 2026,
      todayKey: "2026-10-10",
      entries: [],
      schedule: MON_FRI,
      holidayKeys: NO_HOLIDAYS,
      trackingStart: null,
      initialBalance: 0,
    });
    expect(empty.months.map((m) => m.status)).toEqual([
      ...Array(10).fill("untracked"),
      "future",
      "future",
    ]);
    expect(empty.openingBalance).toBeNull();
    expect(empty.closingBalance).toBeNull();
  });

  it("zeigt ein vergangenes Jahr vollständig abgeschlossen", () => {
    const past = buildYearReport({
      year: 2026,
      todayKey: "2027-03-01",
      entries,
      schedule: MON_FRI,
      holidayKeys: NO_HOLIDAYS,
      trackingStart,
      initialBalance: 5,
    });
    expect(past.months[9].status).toBe("closed");
    expect(past.months[11].status).toBe("closed");
    expect(past.months[11].to).toBe("2026-12-31");
  });
});
