import { describe, expect, it } from "vitest";
import { buildAbsenceReport } from "./absences";
import {
  buildForecast,
  computeBaseline,
  forecastEndMonth,
  forecastMonthKeys,
} from "./forecast";
import { dateKeysBetween, type ReportEntry, type WorkSchedule } from "./year";

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
): ReportEntry {
  return { date, hours: 8, type, source: "TIMING_SYNC", billingStatus: null };
}

function workEveryWeekday(
  from: string,
  to: string,
  hours: number,
  skip: string[] = [],
  extra: Partial<ReportEntry> = {},
): ReportEntry[] {
  return dateKeysBetween(from, to)
    .filter((key) => {
      const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
      return weekday >= 1 && weekday <= 5 && !skip.includes(key);
    })
    .map((key) => work(key, hours, extra));
}

describe("forecastMonthKeys", () => {
  it("reicht vom laufenden Monat bis Dezember plus Horizont", () => {
    expect(forecastMonthKeys("2026-10-10", 3)).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
    ]);
    expect(forecastEndMonth("2026-10-10", 6)).toBe("2027-06");
    expect(forecastEndMonth("2026-10-10", 12)).toBe("2027-12");
  });

  it("verlängert den Zeitraum mit jedem Horizont, auch früh im Jahr", () => {
    expect(forecastEndMonth("2026-03-05", 3)).toBe("2027-03");
    expect(forecastEndMonth("2026-03-05", 6)).toBe("2027-06");
    expect(forecastMonthKeys("2026-03-05", 3)).toHaveLength(13);
  });
});

describe("computeBaseline", () => {
  // Erfassung ab Mo 03.08.2026; heute Sa 10.10.2026
  const entries: ReportEntry[] = [
    // Aug: 21 Arbeitstage, 21.08. Urlaub → 20 verfügbar à 9 h = 180 h
    ...workEveryWeekday("2026-08-03", "2026-08-31", 9, ["2026-08-21"]),
    absence("2026-08-21", "VACATION"),
    // Sep: 22 Arbeitstage, 15.09. krank → 21 verfügbar à 8 h = 168 h
    ...workEveryWeekday("2026-09-01", "2026-09-30", 8, ["2026-09-15"]),
    absence("2026-09-15", "SICK"),
    // laufender Monat zählt nicht zur Basis
    ...workEveryWeekday("2026-10-01", "2026-10-09", 12),
  ];

  it("nimmt nur abgeschlossene Monate mit Daten und rechnet ab Erfassungsbeginn", () => {
    const baseline = computeBaseline({
      todayKey: "2026-10-10",
      baseMonths: 6,
      entries,
      schedule: MON_FRI,
      holidayKeys: NO_HOLIDAYS,
      trackingStart: "2026-08-03",
    });
    expect(baseline.consideredMonths).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(baseline.months.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
    expect(baseline.months[0]).toMatchObject({
      from: "2026-08-03",
      workHours: 180,
      availableDays: 20,
      absenceDays: 1,
    });
    expect(baseline.months[1]).toMatchObject({
      workHours: 168,
      availableDays: 21,
    });
    // gepoolt: 348 h / 41 Tage
    expect(baseline.hoursPerDay).toBeCloseTo(348 / 41, 10);
  });

  it("lässt Feiertage und aufgefüllte Tage aus der Basis heraus", () => {
    const baseline = computeBaseline({
      todayKey: "2026-10-10",
      baseMonths: 1,
      entries: [
        // Sep: Woche 07.–11. aufgefüllt, Rest echt à 8 h; 30.09. Feiertag
        ...workEveryWeekday("2026-09-07", "2026-09-11", 8, [], {
          source: "BULK_FILL",
        }),
        ...workEveryWeekday("2026-09-01", "2026-09-30", 8, [
          "2026-09-07",
          "2026-09-08",
          "2026-09-09",
          "2026-09-10",
          "2026-09-11",
          "2026-09-30",
        ]),
      ],
      schedule: MON_FRI,
      holidayKeys: new Set(["2026-09-30"]),
      trackingStart: null,
    });
    expect(baseline.months).toHaveLength(1);
    expect(baseline.months[0]).toMatchObject({
      workHours: 16 * 8,
      availableDays: 16,
      holidayDays: 1,
      bulkFillDays: 5,
    });
    expect(baseline.hoursPerDay).toBe(8);
  });

  it("überspringt Monate ohne echte Arbeit", () => {
    const baseline = computeBaseline({
      todayKey: "2026-10-10",
      baseMonths: 3,
      entries: workEveryWeekday("2026-08-01", "2026-08-31", 8, [], {
        source: "BULK_FILL",
      }),
      schedule: MON_FRI,
      holidayKeys: NO_HOLIDAYS,
      trackingStart: null,
    });
    expect(baseline.months).toEqual([]);
    expect(baseline.hoursPerDay).toBeNull();
    expect(baseline.billableQuote).toBeNull();
  });

  it("berechnet die Abrechnungsquote abrechenbar / gesamt wie der Abrechnungsbericht", () => {
    const baseline = computeBaseline({
      todayKey: "2026-10-10",
      baseMonths: 1,
      entries: [
        work("2026-09-01", 6, { billingStatus: "billable" }),
        work("2026-09-02", 2, { billingStatus: "not_billable" }),
        work("2026-09-03", 10, { billingStatus: null }),
      ],
      schedule: MON_FRI,
      holidayKeys: NO_HOLIDAYS,
      trackingStart: null,
    });
    // 6 h abrechenbar von 18 h gesamt; ohne Status zählt im Nenner mit
    expect(baseline.billableQuote).toBe(6 / 18);
    expect(baseline.billableHours).toBe(6);
    expect(baseline.nonBillableHours).toBe(2);
    expect(baseline.unknownBillingHours).toBe(10);
  });

  it("liefert keine Quote, wenn kein Eintrag einen Status hat", () => {
    const baseline = computeBaseline({
      todayKey: "2026-10-10",
      baseMonths: 1,
      entries: [work("2026-09-01", 6)],
      schedule: MON_FRI,
      holidayKeys: NO_HOLIDAYS,
      trackingStart: null,
    });
    expect(baseline.hoursPerDay).not.toBeNull();
    expect(baseline.billableQuote).toBeNull();
  });
});

describe("buildForecast", () => {
  const history: ReportEntry[] = [
    // Sep: 22 Arbeitstage à 9 h, alles abrechenbar zu 3/4
    ...workEveryWeekday("2026-09-01", "2026-09-30", 6, [], {
      billingStatus: "billable",
    }),
    ...workEveryWeekday("2026-09-01", "2026-09-30", 3, [], {
      billingStatus: "not_billable",
    }),
    // Okt bis heute
    ...workEveryWeekday("2026-10-01", "2026-10-09", 8, [], {
      billingStatus: "billable",
    }),
  ];
  const planned: ReportEntry[] = [
    // geplanter Urlaub 02.–06.11., krank 01.12.
    ...dateKeysBetween("2026-11-02", "2026-11-06").map((key) =>
      absence(key, "VACATION"),
    ),
    absence("2026-12-01", "SICK"),
  ];

  const forecast = buildForecast({
    todayKey: "2026-10-10",
    horizon: 3,
    baseMonths: 1,
    entries: [...history, ...planned],
    schedule: MON_FRI,
    holidayKeys: new Set(["2026-12-25", "2027-01-01"]),
    trackingStart: "2026-09-01",
    currentBalance: 10,
  });

  it("nutzt Ø pro Tag und Quote aus der Basis", () => {
    expect(forecast.hoursPerDay).toBe(9);
    expect(forecast.usedFallback).toBe(false);
    expect(forecast.billableQuote).toBeCloseTo(2 / 3, 10);
    expect(forecast.months.map((m) => m.month)).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
    ]);
  });

  it("prognostiziert im laufenden Monat nur die Tage ab morgen", () => {
    const oct = forecast.months[0];
    expect(oct.kind).toBe("current");
    expect(oct.from).toBe("2026-10-11");
    expect(oct.to).toBe("2026-10-31");
    expect(oct.availableDays).toBe(15);
    expect(oct.targetHours).toBe(120);
    expect(oct.expectedHours).toBe(135);
    expect(oct.deltaHours).toBe(15);
    expect(oct.balanceHours).toBe(25);
    expect(oct.toDate).toMatchObject({
      actualHours: 56,
      targetHours: 56,
      billableHours: 56,
    });
  });

  it("zieht geplanten Urlaub, Krankheit und Feiertage ab", () => {
    const nov = forecast.months[1];
    expect(nov.workDays).toBe(21);
    expect(nov.absenceDays).toBe(5);
    expect(nov.availableDays).toBe(16);
    expect(nov.targetHours).toBe(128);
    expect(nov.expectedHours).toBe(144);
    expect(nov.expectedBillableHours).toBeCloseTo(96, 10);

    const dec = forecast.months[2];
    expect(dec.workDays).toBe(23);
    expect(dec.holidayDays).toBe(1);
    expect(dec.holidays).toEqual(["2026-12-25"]);
    expect(dec.absenceDays).toBe(1);
    expect(dec.availableDays).toBe(21);
  });

  it("führt den Saldo ab dem aktuellen Saldo kumuliert fort", () => {
    // +1 h je verfügbarem Tag
    const days = forecast.months.map((m) => m.availableDays);
    let balance = 10;
    forecast.months.forEach((month, index) => {
      balance += days[index];
      expect(month.balanceHours).toBeCloseTo(balance, 10);
    });
    expect(forecast.startBalance).toBe(10);
    expect(forecast.endBalance).toBeCloseTo(balance, 10);
    expect(forecast.totals.deltaHours).toBeCloseTo(balance - 10, 10);
  });

  it("zählt halbe Urlaubstage anteilig", () => {
    const half = buildForecast({
      todayKey: "2026-10-10",
      horizon: 3,
      baseMonths: 1,
      entries: [...history, { ...absence("2026-12-24", "VACATION"), hours: 4 }],
      schedule: MON_FRI,
      holidayKeys: NO_HOLIDAYS,
      trackingStart: "2026-09-01",
      currentBalance: 0,
    });
    const dec = half.months[2];
    expect(dec.absenceDays).toBe(0.5);
    expect(dec.availableDays).toBe(22.5);
    expect(dec.targetHours).toBe(180);
  });

  it("fällt ohne Erfahrungswerte auf das Tagessoll zurück", () => {
    const fallback = buildForecast({
      todayKey: "2026-10-10",
      horizon: 3,
      baseMonths: 6,
      entries: [],
      schedule: MON_THU,
      holidayKeys: NO_HOLIDAYS,
      trackingStart: null,
      currentBalance: -2,
    });
    expect(fallback.usedFallback).toBe(true);
    expect(fallback.hoursPerDay).toBe(8);
    expect(fallback.billableQuote).toBeNull();
    expect(fallback.months[1].expectedBillableHours).toBeNull();
    expect(fallback.months.every((m) => m.deltaHours === 0)).toBe(true);
    expect(fallback.endBalance).toBe(-2);
    // 4-Tage-Woche: Nov 2026 hat 17 Mo–Do
    expect(fallback.months[1].workDays).toBe(17);
  });

  it("zählt am Monatsletzten keine Resttage mehr", () => {
    const lastDay = buildForecast({
      todayKey: "2026-10-31",
      horizon: 3,
      baseMonths: 1,
      entries: history,
      schedule: MON_FRI,
      holidayKeys: NO_HOLIDAYS,
      trackingStart: "2026-09-01",
      currentBalance: 0,
    });
    expect(lastDay.months[0].availableDays).toBe(0);
    expect(lastDay.months[0].from).toBeNull();
  });

  describe("heutiger Tag", () => {
    // Mo 12.10.2026; Basis September mit 8 h an jedem Werktag (= Tagessoll)
    const september = workEveryWeekday("2026-09-01", "2026-09-30", 8);
    const base = {
      todayKey: "2026-10-12",
      horizon: 3,
      baseMonths: 1,
      schedule: MON_FRI,
      holidayKeys: NO_HOLIDAYS,
      trackingStart: "2026-09-01",
    };

    it("rechnet den Rest von heute mit, wenn noch nichts erfasst ist", () => {
      // Der Saldo enthält das Soll von heute, aber noch keine Arbeit
      const forecast = buildForecast({
        ...base,
        entries: september,
        currentBalance: -8,
      });
      expect(forecast.months[0].todayRemainingHours).toBe(8);
      expect(forecast.months[0].deltaHours).toBe(8);
      expect(forecast.endBalance).toBe(0);
    });

    it("zieht bereits erfasste Arbeit von heute ab", () => {
      const forecast = buildForecast({
        ...base,
        entries: [...september, work("2026-10-12", 3)],
        currentBalance: -5,
      });
      expect(forecast.months[0].todayRemainingHours).toBe(5);
      expect(forecast.endBalance).toBe(0);
    });

    it("ergänzt nichts an Feiertagen, bei Abwesenheit und am Wochenende", () => {
      const holiday = buildForecast({
        ...base,
        entries: september,
        holidayKeys: new Set(["2026-10-12"]),
        currentBalance: 0,
      });
      expect(holiday.months[0].todayRemainingHours).toBe(0);

      const vacation = buildForecast({
        ...base,
        entries: [...september, absence("2026-10-12", "VACATION")],
        currentBalance: 0,
      });
      expect(vacation.months[0].todayRemainingHours).toBe(0);

      const saturday = buildForecast({
        ...base,
        todayKey: "2026-10-10",
        entries: september,
        currentBalance: 0,
      });
      expect(saturday.months[0].todayRemainingHours).toBe(0);
      expect(saturday.months[1].todayRemainingHours).toBe(0);
    });
  });

  describe("geplante Abwesenheit wie im Abwesenheiten-Bericht", () => {
    const vacation = (date: string, hours: number): ReportEntry => ({
      ...absence(date, "VACATION"),
      hours,
    });
    const sick = (date: string, hours: number): ReportEntry => ({
      ...absence(date, "SICK"),
      hours,
    });

    function novemberAbsenceDays(entries: ReportEntry[]): number {
      return buildForecast({
        todayKey: "2026-10-10",
        horizon: 3,
        baseMonths: 1,
        entries: [...history, ...entries],
        schedule: MON_FRI,
        holidayKeys: NO_HOLIDAYS,
        trackingStart: "2026-09-01",
        currentBalance: 0,
      }).months[1].absenceDays;
    }

    it("rundet auf halbe Tage wie der Abwesenheiten-Bericht", () => {
      const planned = [vacation("2026-11-02", 3), vacation("2026-11-03", 6)];
      const report = buildAbsenceReport({
        year: 2026,
        todayKey: "2026-10-10",
        settings: {
          weeklyWorkHours: 40,
          workDays: [1, 2, 3, 4, 5],
          annualVacationDays: 30,
        },
        entries: planned.map((e) => ({
          dateKey: e.date,
          type: "VACATION" as const,
          hours: e.hours,
        })),
        reviewedDays: [],
      });
      expect(report.months[10].plannedVacationDays).toBe(1.5);
      expect(novemberAbsenceDays(planned)).toBe(1.5);
    });

    it("ignoriert Einträge mit 0 h", () => {
      expect(novemberAbsenceDays([vacation("2026-11-02", 0)])).toBe(0);
    });

    it("rechnet Urlaub und Krankheit eines Tages je Typ um", () => {
      // je 2 h → je ½ Tag, zusammen ein ganzer Tag (wie im Bericht)
      expect(
        novemberAbsenceDays([vacation("2026-11-02", 2), sick("2026-11-02", 2)]),
      ).toBe(1);
    });
  });
  describe("Überstundenabbau und unbezahlte Abwesenheit", () => {
    function withPlanned(
      entries: ReportEntry[],
      todayEntries: ReportEntry[] = [],
    ) {
      return buildForecast({
        todayKey: "2026-10-10",
        horizon: 3,
        baseMonths: 1,
        entries: [...history, ...entries, ...todayEntries],
        schedule: MON_FRI,
        holidayKeys: NO_HOLIDAYS,
        trackingStart: "2026-09-01",
        currentBalance: 0,
      });
    }
    const week = dateKeysBetween("2026-11-02", "2026-11-06");

    it("Überstundenabbau mindert das erwartete Ist, nicht das Soll", () => {
      const nov = withPlanned(
        week.map((key) => absence(key, "OVERTIME_REDUCTION")),
      ).months[1];
      expect(nov.workDays).toBe(21);
      expect(nov.overtimeReductionDays).toBe(5);
      expect(nov.absenceDays).toBe(0);
      expect(nov.availableDays).toBe(16);
      expect(nov.targetHours).toBe(168);
      expect(nov.expectedHours).toBe(144);
      expect(nov.deltaHours).toBe(-24);
    });

    it("unbezahlte Abwesenheit setzt das Soll der Tage auf 0", () => {
      const forecast = withPlanned(
        week.map((key) => absence(key, "UNPAID_LEAVE")),
      );
      const nov = forecast.months[1];
      expect(nov.unpaidDays).toBe(5);
      expect(nov.absenceDays).toBe(0);
      expect(nov.availableDays).toBe(16);
      expect(nov.targetHours).toBe(128);
      expect(nov.expectedHours).toBe(144);
      expect(forecast.totals.unpaidDays).toBe(5);
      expect(forecast.totals.overtimeReductionDays).toBe(0);
    });

    it("rechnet halbe Tage anteilig und höchstens einen Tag je Datum", () => {
      const nov = withPlanned([
        { ...absence("2026-11-02", "VACATION"), hours: 4 },
        { ...absence("2026-11-02", "OVERTIME_REDUCTION"), hours: 4 },
        { ...absence("2026-11-03", "UNPAID_LEAVE"), hours: 4 },
        { ...absence("2026-11-03", "OVERTIME_REDUCTION"), hours: 8 },
      ]).months[1];
      expect(nov.absenceDays).toBe(0.5);
      expect(nov.unpaidDays).toBe(0.5);
      expect(nov.overtimeReductionDays).toBe(1);
      expect(nov.availableDays).toBe(19);
      // Soll: 21 − ½ Urlaub − ½ unbezahlt = 20 Tage
      expect(nov.targetHours).toBe(160);
    });

    it("lässt vergangene Tage beider Arten aus der Basis heraus", () => {
      const baseline = computeBaseline({
        todayKey: "2026-10-10",
        baseMonths: 1,
        entries: [
          ...workEveryWeekday("2026-09-01", "2026-09-30", 9, [
            "2026-09-01",
            "2026-09-02",
          ]),
          absence("2026-09-01", "OVERTIME_REDUCTION"),
          absence("2026-09-02", "UNPAID_LEAVE"),
        ],
        schedule: MON_FRI,
        holidayKeys: NO_HOLIDAYS,
        trackingStart: null,
      });
      expect(baseline.months[0].availableDays).toBe(20);
      expect(baseline.hoursPerDay).toBe(9);
    });

    it("ergänzt heute keinen Rest bei Überstundenabbau oder unbezahltem Tag", () => {
      for (const type of ["OVERTIME_REDUCTION", "UNPAID_LEAVE"] as const) {
        const forecast = buildForecast({
          todayKey: "2026-10-09",
          horizon: 3,
          baseMonths: 1,
          entries: [
            ...history.filter((e) => e.date !== "2026-10-09"),
            absence("2026-10-09", type),
          ],
          schedule: MON_FRI,
          holidayKeys: NO_HOLIDAYS,
          trackingStart: "2026-09-01",
          currentBalance: 0,
        });
        expect(forecast.months[0].todayRemainingHours).toBe(0);
      }
    });
  });
});
