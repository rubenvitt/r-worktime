import { describe, expect, it } from "vitest";
import {
  type BookedDay,
  bookedDayFromReport,
  bridgeSuggestions,
  clipToYear,
  createPlannerContext,
  freeStretch,
  spanBetween,
  spanCost,
  spansOverlap,
  summarizeDraft,
} from "./vacation-planner";

// Gesetzliche Feiertage in Niedersachsen (Auszug)
const HOLIDAYS: Record<string, string> = {
  "2026-12-25": "1. Weihnachtstag",
  "2026-12-26": "2. Weihnachtstag",
  "2027-01-01": "Neujahr",
  "2027-03-26": "Karfreitag",
  "2027-03-29": "Ostermontag",
  "2027-05-01": "Tag der Arbeit",
  "2027-05-06": "Christi Himmelfahrt",
  "2027-05-17": "Pfingstmontag",
  "2027-10-03": "Tag der Deutschen Einheit",
  "2027-10-31": "Reformationstag",
  "2027-12-25": "1. Weihnachtstag",
  "2027-12-26": "2. Weihnachtstag",
};

function ctx(booked: BookedDay[] = [], workDays = [1, 2, 3, 4, 5]) {
  return createPlannerContext({ workDays, holidays: HOLIDAYS, booked });
}

function booked(dateKey: string, share = 1): BookedDay {
  return { dateKey, share, countsAsVacation: true };
}

describe("spanCost", () => {
  it("zählt nur Arbeitstage ohne Feiertag", () => {
    // Mo 29.03. Ostermontag bis So 04.04.
    expect(spanCost({ from: "2027-03-29", to: "2027-04-04" }, ctx())).toEqual({
      workDays: 4,
      needed: 4,
      booked: 0,
      open: 4,
    });
  });

  it("zieht gebuchte Tage ab, halbe Tage zur Hälfte", () => {
    const cost = spanCost(
      { from: "2027-07-05", to: "2027-07-09" },
      ctx([booked("2027-07-05"), booked("2027-07-06", 0.5)]),
    );
    expect(cost).toEqual({ workDays: 5, needed: 5, booked: 1.5, open: 3.5 });
  });

  it("richtet sich nach den eingestellten Arbeitstagen", () => {
    // Nur Mo–Do: Freitag kostet nichts
    expect(
      spanCost({ from: "2027-07-05", to: "2027-07-09" }, ctx([], [1, 2, 3, 4]))
        .open,
    ).toBe(4);
  });
});

describe("freeStretch", () => {
  it("verlängert um Wochenenden und Feiertage", () => {
    // Di 30.03.–Fr 02.04. nach Ostern: Karfreitag bis Sonntag danach
    expect(
      freeStretch({ from: "2027-03-30", to: "2027-04-02" }, ctx()),
    ).toEqual({ from: "2027-03-26", to: "2027-04-04" });
  });

  it("schließt angrenzenden gebuchten Urlaub ein, halbe Tage nicht", () => {
    const context = ctx([booked("2027-07-12"), booked("2027-07-09", 0.5)]);
    expect(
      freeStretch({ from: "2027-07-05", to: "2027-07-08" }, context),
    ).toEqual({ from: "2027-07-03", to: "2027-07-08" });
    expect(
      freeStretch({ from: "2027-07-13", to: "2027-07-16" }, context),
    ).toEqual({ from: "2027-07-10", to: "2027-07-18" });
  });
});

describe("summarizeDraft", () => {
  it("offen, teilweise und gebucht", () => {
    const span = { from: "2027-08-02", to: "2027-08-06" };
    expect(summarizeDraft(span, ctx()).status).toBe("open");
    expect(summarizeDraft(span, ctx([booked("2027-08-02")])).status).toBe(
      "partial",
    );
    const all = ["02", "03", "04", "05", "06"].map((d) =>
      booked(`2027-08-${d}`),
    );
    const summary = summarizeDraft(span, ctx(all));
    expect(summary).toMatchObject({
      status: "booked",
      open: 0,
      stretch: { from: "2027-07-31", to: "2027-08-08" },
      stretchDays: 9,
    });
  });

  it("ein Entwurf nur über Feiertag und Wochenende ist offen, nicht gebucht", () => {
    expect(
      summarizeDraft({ from: "2027-05-01", to: "2027-05-02" }, ctx()),
    ).toMatchObject({ status: "open", workDays: 0, open: 0 });
  });
});

describe("Heiligabend und Silvester", () => {
  it("kosten an Arbeitstagen nur einen halben Urlaubstag", () => {
    // Mo 21.12.–Do 31.12.2026: Do 24. und Do 31. halb, 25./26. Feiertag
    expect(spanCost({ from: "2026-12-21", to: "2026-12-31" }, ctx())).toEqual({
      workDays: 8,
      needed: 7,
      booked: 0,
      open: 7,
    });
  });

  it("gilt mit halbem Tag gebucht als frei und gebucht", () => {
    const context = ctx([booked("2026-12-24", 0.5)]);
    expect(
      freeStretch({ from: "2026-12-21", to: "2026-12-23" }, context),
    ).toEqual({ from: "2026-12-19", to: "2026-12-27" });
    expect(
      summarizeDraft({ from: "2026-12-24", to: "2026-12-24" }, context),
    ).toMatchObject({ status: "booked", open: 0 });
  });

  it("Wochenende bleibt frei, auch am 24.12.", () => {
    // Fr 24.12.2027 ist ein Arbeitstag, Fr 31.12.2027 auch; Sa 24.12.2022 nicht
    expect(spanCost({ from: "2027-12-24", to: "2027-12-24" }, ctx()).open).toBe(
      0.5,
    );
    expect(spanCost({ from: "2022-12-24", to: "2022-12-24" }, ctx()).open).toBe(
      0,
    );
  });

  it("macht die Woche vor Weihnachten zur Brücke", () => {
    const result = bridgeSuggestions(2026, "2026-10-18", ctx());
    expect(result.find((s) => s.from === "2026-12-21")).toMatchObject({
      to: "2026-12-24",
      cost: 3.5,
      stretch: { from: "2026-12-19", to: "2026-12-27" },
      stretchDays: 9,
    });
  });
});

describe("bridgeSuggestions", () => {
  it("findet die Brückentage 2027 und rechnet den Gewinn", () => {
    const result = bridgeSuggestions(2027, "2026-10-18", ctx());
    expect(
      result.map((s) => [s.from, s.to, s.cost, s.stretchDays, s.holidayNames]),
    ).toEqual([
      ["2027-03-22", "2027-03-25", 4, 10, ["Karfreitag", "Ostermontag"]],
      ["2027-03-30", "2027-04-02", 4, 10, ["Karfreitag", "Ostermontag"]],
      [
        "2027-05-03",
        "2027-05-05",
        3,
        6,
        ["Tag der Arbeit", "Christi Himmelfahrt"],
      ],
      // Mo–Mi und Fr um Himmelfahrt: eine ganze Woche
      [
        "2027-05-03",
        "2027-05-07",
        4,
        9,
        ["Tag der Arbeit", "Christi Himmelfahrt"],
      ],
      ["2027-05-07", "2027-05-07", 1, 4, ["Christi Himmelfahrt"]],
      ["2027-05-18", "2027-05-21", 4, 9, ["Pfingstmontag"]],
    ]);
    const ascension = result[4];
    expect(ascension.stretch).toEqual({ from: "2027-05-06", to: "2027-05-09" });
    expect(ascension.efficiency).toBe(4);
  });

  it("nimmt Brücken über den Jahreswechsel dem Jahr ihres Beginns zu", () => {
    const result = bridgeSuggestions(2026, "2026-10-18", ctx());
    // Silvester kostet nur ½ Tag
    expect(result.at(-1)).toMatchObject({
      from: "2026-12-28",
      to: "2026-12-31",
      cost: 3.5,
      stretch: { from: "2026-12-25", to: "2027-01-03" },
      stretchDays: 10,
    });
  });

  it("lässt vergangene und schon gebuchte Brücken weg", () => {
    expect(
      bridgeSuggestions(2027, "2027-05-07", ctx()).map((s) => s.from),
    ).toEqual(["2027-05-18"]);
    const withBooking = bridgeSuggestions(
      2027,
      "2026-10-18",
      ctx([booked("2027-05-07")]),
    );
    expect(withBooking.some((s) => s.from === "2027-05-07")).toBe(false);
  });
});

describe("Hilfen", () => {
  it("clipToYear, spansOverlap, spanBetween", () => {
    expect(clipToYear({ from: "2026-12-28", to: "2027-01-04" }, 2027)).toEqual({
      from: "2027-01-01",
      to: "2027-01-04",
    });
    expect(
      clipToYear({ from: "2026-12-28", to: "2026-12-31" }, 2027),
    ).toBeNull();
    expect(
      spansOverlap(
        { from: "2027-05-01", to: "2027-05-07" },
        { from: "2027-05-07", to: "2027-05-09" },
      ),
    ).toBe(true);
    expect(spanBetween("2027-05-09", "2027-05-01")).toEqual({
      from: "2027-05-01",
      to: "2027-05-09",
    });
  });
});

describe("bookedDayFromReport", () => {
  it("summiert Abwesenheiten ohne Feiertag, nur an Arbeitstagen", () => {
    const days = {
      vacation: 0.5,
      specialLeave: 0,
      educationalLeave: 0,
      overtimeReduction: 0,
      sick: 0,
      holiday: 0,
      unpaid: 0,
    };
    expect(
      bookedDayFromReport({ dateKey: "2027-07-05", isWorkDay: true, days }),
    ).toEqual({ dateKey: "2027-07-05", share: 0.5, countsAsVacation: true });
    expect(
      bookedDayFromReport({
        dateKey: "2027-05-06",
        isWorkDay: true,
        days: { ...days, vacation: 0, holiday: 1 },
      }),
    ).toBeNull();
    expect(
      bookedDayFromReport({ dateKey: "2027-07-03", isWorkDay: false, days }),
    ).toBeNull();
  });
});
