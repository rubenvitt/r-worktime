import { describe, expect, it } from "vitest";
import {
  aggregateTimesheet,
  buildTimesheetPayload,
  formatActivityLine,
  formatMinutes,
  normalizeRawRecords,
  ROUNDING_OPTIONS,
  type Rounding,
  type TimesheetDay,
} from "./aggregate";
import {
  type RTimesDayEntry,
  rTimesCopyAllAsJson,
  rTimesProcessData,
} from "./rtimes-reference";

// Alle Testdaten sind synthetisch und haben einen expliziten Offset,
// damit `new Date()` nicht von der Zeitzone des Rechners abhängt.

const exampleA = [
  {
    activityTitle: "Alpha | 101: Backend",
    startDate: "2026-03-02T08:00:00+01:00",
    endDate: "2026-03-02T10:07:00+01:00",
    notes: "API-Design",
  },
  {
    activityTitle: "Meetings(Daily)",
    startDate: "2026-03-02T10:15:00+01:00",
    endDate: "2026-03-02T10:30:00+01:00",
    notes: "Sync",
  },
  {
    activityTitle: "Alpha | 101: Backend",
    startDate: "2026-03-02T10:30:00+01:00",
    endDate: "2026-03-02T12:00:00+01:00",
    notes: "Tests",
  },
  {
    activityTitle: "Alpha | 101: Backend",
    startDate: "2026-03-02T13:00:00+01:00",
    endDate: "2026-03-02T14:00:00+01:00",
    notes: "API-Design",
  },
  {
    activityTitle: "Meetings(Retro)",
    startDate: "2026-03-02T14:00:00+01:00",
    endDate: "2026-03-02T15:00:00+01:00",
  },
  {
    activityTitle: "Beta | 202: Workshop",
    startDate: "2026-03-02T15:00:00+01:00",
    endDate: "2026-03-02T15:20:00+01:00",
  },
];

const exampleB = {
  records: [
    {
      project: "Gamma",
      start: "2026-03-03T00:30:00+01:00",
      end: "2026-03-03T01:00:00+01:00",
      notes: "Hotfix",
    },
    {
      activityTitle: "Gamma | 7: Kunde",
      start: "2026-03-03T09:00:00+01:00",
      stopDate: "2026-03-03T16:52:00+01:00",
      notes: "Vor Ort beim Kunden",
    },
    {
      startDate: "2026-03-03T17:00:00+01:00",
      endDate: "2026-03-03T17:07:30+01:00",
    },
    { startDate: "kaputt", endDate: "2026-03-03T18:00:00+01:00" },
  ],
};

const exampleC = [
  {
    activityTitle: "Meetings (Planning)",
    startDate: "2026-04-01T08:00:00Z",
    endDate: "2026-04-01T08:22:30Z",
  },
  {
    activityTitle: "Meetings(Daily)",
    startDate: "2026-04-01T09:00:00Z",
    endDate: "2026-04-01T09:15:00Z",
    notes: "geht verloren",
  },
];

const meetingVariants = {
  activities: [
    {
      activityTitle: "Meetings(A)(B)",
      startDate: "2026-05-04T07:00:00Z",
      endDate: "2026-05-04T07:30:00Z",
    },
    {
      activityTitle: " Meetings(Vorne)",
      startDate: "2026-05-04T08:00:00Z",
      endDate: "2026-05-04T08:10:00Z",
    },
    {
      activityTitle: "Meetings(Planning)",
      startDate: "2026-05-04T09:00:00Z",
      endDate: "2026-05-04T09:45:00Z",
      notes: "verworfen",
    },
    {
      activityTitle: "Meetings (Mit Leerzeichen)",
      startDate: "2026-05-04T10:00:00Z",
      endDate: "2026-05-04T10:20:00Z",
      notes: "bleibt",
    },
    {
      activityTitle: "Meetings()",
      startDate: "2026-05-04T11:00:00Z",
      endDate: "2026-05-04T11:05:00Z",
    },
    {
      activityTitle: "Meetings(Daily)",
      startDate: "2026-05-04T12:00:00Z",
      endDate: "2026-05-04T12:15:00Z",
    },
  ],
};

const edgeCases = [
  // Gleichstand: Einfügereihenfolge bleibt (stabile Sortierung)
  {
    activityTitle: "Delta | 1: Zweiter",
    startDate: "2026-06-01T08:00:00Z",
    endDate: "2026-06-01T08:30:00Z",
    notes: "b",
  },
  {
    activityTitle: "Delta | 2: Erster",
    startDate: "2026-06-01T07:00:00Z",
    endDate: "2026-06-01T07:30:00Z",
    notes: "a",
  },
  // doppelte Notizen, leere Notiz, null-Notiz
  {
    activityTitle: "Delta | 1: Zweiter",
    startDate: "2026-06-01T09:00:00Z",
    endDate: "2026-06-01T09:01:00Z",
    notes: "b",
  },
  {
    activityTitle: "Delta | 1: Zweiter",
    startDate: "2026-06-01T09:05:00Z",
    endDate: "2026-06-01T09:06:00Z",
    notes: "",
  },
  {
    activityTitle: "Delta | 2: Erster",
    startDate: "2026-06-01T09:10:00Z",
    endDate: "2026-06-01T09:11:00Z",
    notes: null,
  },
  // Dienstreise-Keyword in der Notiz, Groß-/Kleinschreibung
  {
    activityTitle: "Epsilon | 3: Review",
    startDate: "2026-06-02T08:00:00Z",
    endDate: "2026-06-02T09:00:00Z",
    notes: "Termin ONSITE",
  },
  // leerer Titel fällt auf project zurück, ohne beides auf "Ohne Titel"
  {
    activityTitle: "",
    project: "Work ▸ Firma ▸ Kunde A",
    startDate: "2026-06-03T08:00:00Z",
    endDate: "2026-06-03T08:20:00Z",
  },
  {
    startDate: "2026-06-03T09:00:00Z",
    endDate: "2026-06-03T09:00:30Z",
  },
  // negative Dauer wird nicht gefiltert
  {
    activityTitle: "Zeta | 4: Kaputt",
    startDate: "2026-06-03T12:00:00Z",
    endDate: "2026-06-03T11:50:00Z",
    notes: "negativ",
  },
  // über Mitternacht: alles zählt zum Starttag
  {
    activityTitle: "Eta | 5: Nachtschicht",
    startDate: "2026-06-03T23:00:00Z",
    endDate: "2026-06-04T01:30:00Z",
    notes: "Deployment",
  },
  // Präsenz nur im Titel
  {
    activityTitle: "Präsenztag Kunde A",
    startDate: "2026-06-05T08:00:00+02:00",
    endDate: "2026-06-05T16:00:00+02:00",
  },
];

// Mitternachtsfall: 00:30 Berlin = Vortag in UTC
const midnightCase = [
  {
    activityTitle: "Theta | 6: Hotfix",
    startDate: "2026-09-02T00:30:00+02:00",
    endDate: "2026-09-02T01:15:00+02:00",
    notes: "Nachts",
  },
  {
    activityTitle: "Theta | 6: Hotfix",
    startDate: "2026-09-02T09:00:00+02:00",
    endDate: "2026-09-02T10:00:00+02:00",
    notes: "Tagsüber",
  },
];

// Rundung: 7,5 → 8, 22,5 → 23 Minuten usw.; halbe Einheiten pro Rundung
const roundingCases = [
  2, 3, 5, 7, 8, 15, 22, 23, 37, 38, 45, 52, 53, 89, 90, 91,
].map((minutes, i) => ({
  activityTitle: `Iota | ${i}: Rundung`,
  startDate: `2026-07-${String(i + 1).padStart(2, "0")}T08:00:00Z`,
  endDate: new Date(
    Date.parse(`2026-07-${String(i + 1).padStart(2, "0")}T08:00:00Z`) +
      minutes * 60000,
  ).toISOString(),
  notes: "x",
}));

/** Deterministischer Zufall (mulberry32) für den Fuzz-Vergleich. */
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fuzzRecords(seed: number, count: number) {
  const rand = prng(seed);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  const titles = [
    "Alpha | 101: Backend",
    "Beta | 202: Workshop",
    "Meetings(Daily)",
    "Meetings(Retro)",
    "Meetings (Planning)",
    "Kappa(intern)",
    "Lambda | 9: Vorort-Termin",
    "",
    undefined,
  ];
  const notes = ["", "", "API-Design", "Tests", "Review", "vor Ort", null];
  const base = Date.parse("2026-08-01T00:00:00Z");
  return Array.from({ length: count }, () => {
    const start = base + Math.floor(rand() * 5 * 24 * 60) * 60000;
    const durationMs = Math.floor(rand() * 240 * 2) * 30000;
    return {
      activityTitle: pick(titles),
      project: rand() < 0.5 ? "Work ▸ Firma ▸ Kunde A" : undefined,
      startDate: new Date(start).toISOString(),
      endDate: new Date(start + durationMs).toISOString(),
      notes: pick(notes),
    };
  });
}

function portDays(input: unknown): TimesheetDay[] {
  return aggregateTimesheet(normalizeRawRecords(input), { dayBoundary: "UTC" });
}

/** Vergleichbare Sicht auf beide Implementierungen. */
function comparable(days: (TimesheetDay | RTimesDayEntry)[]) {
  return days.map((day) => ({
    date: day.date,
    minutes: day.minutes,
    activities: day.activities.map((a) => ({
      title: a.title,
      minutes: a.minutes,
      notes: a.notes,
      isTitleWithParentheses: a.isTitleWithParentheses,
      hasMissingEntries: a.hasMissingEntries,
    })),
    hasCriticalActivities: day.hasCriticalActivities,
    hasIncompleteActivities: day.hasIncompleteActivities,
    missingEntries: day.missingEntries,
    criticalCount: day.missingEntries.filter((e) => e.isCritical).length,
    travelFee: day.travelFee,
  }));
}

const fixtures: [string, unknown][] = [
  ["Beispiel A", exampleA],
  ["Beispiel B", exampleB],
  ["Beispiel C", exampleC],
  ["Meetings-Varianten", meetingVariants],
  ["Randfälle", edgeCases],
  ["Mitternacht", midnightCase],
  ["Rundung", roundingCases],
  ["Fuzz 1", fuzzRecords(1, 150)],
  ["Fuzz 2", fuzzRecords(42, 400)],
  ["Fuzz 3", fuzzRecords(2026, 60)],
];

describe("Differential-Test gegen die r-times-Referenz (UTC)", () => {
  for (const [name, input] of fixtures) {
    it(`${name}: Tage und Validierung identisch`, () => {
      expect(comparable(portDays(input))).toEqual(
        comparable(rTimesProcessData(input)),
      );
    });

    for (const rounding of ROUNDING_OPTIONS) {
      it(`${name}: Payload identisch bei Rundung ${rounding}`, () => {
        const reference = rTimesCopyAllAsJson(
          rTimesProcessData(input),
          rounding,
        );
        expect(buildTimesheetPayload(portDays(input), rounding)).toEqual(
          reference,
        );
      });
    }
  }
});

describe("Golden-Werte aus dem r-times-Vertrag", () => {
  it("Beispiel A", () => {
    expect(buildTimesheetPayload(portDays(exampleA), 15)).toEqual([
      {
        date: "2026-03-02",
        hours: "6:15",
        text: "Meetings(Retro, Daily); Alpha | 101: Backend # API-Design, Tests; Beta | 202: Workshop",
        travelFee: false,
      },
    ]);
    const [day] = portDays(exampleA);
    expect(day.criticalCount).toBe(1);
    expect(
      day.activities.find((a) => a.title === "Beta | 202: Workshop"),
    ).toMatchObject({ isCritical: true });
    expect(
      day.activities.find((a) => a.title === "Meetings(Retro)"),
    ).toMatchObject({ isCritical: false, hasMissingEntries: false });
  });

  it("Beispiel B", () => {
    expect(buildTimesheetPayload(portDays(exampleB), 15)).toEqual([
      {
        date: "2026-03-02",
        hours: "0:30",
        text: "Gamma # Hotfix",
        travelFee: false,
      },
      {
        date: "2026-03-03",
        hours: "8:00",
        text: "Gamma | 7: Kunde # Vor Ort beim Kunden; Ohne Titel",
        travelFee: true,
      },
    ]);
  });

  it("Beispiel C", () => {
    expect(buildTimesheetPayload(portDays(exampleC), 30)).toEqual([
      {
        date: "2026-04-01",
        hours: "0:30",
        text: "Meetings(Daily); Meetings (Planning)",
        travelFee: false,
      },
    ]);
  });

  it("Meetings: nur exakt Meetings(...) wird gruppiert, Notizen entfallen", () => {
    const [entry] = buildTimesheetPayload(portDays(meetingVariants), 15);
    expect(entry.text).toBe(
      "Meetings(Planning, Daily); Meetings(A)(B); Meetings (Mit Leerzeichen) # bleibt;  Meetings(Vorne); Meetings()",
    );
  });
});

describe("Tagesgrenze Europe/Berlin", () => {
  it("ordnet 00:30 Berlin dem Berlin-Tag zu (r-times: Vortag)", () => {
    const records = normalizeRawRecords(midnightCase);
    const berlin = aggregateTimesheet(records);
    const utc = aggregateTimesheet(records, { dayBoundary: "UTC" });

    expect(berlin.map((d) => [d.date, d.minutes])).toEqual([
      ["2026-09-02", 105],
    ]);
    expect(utc.map((d) => [d.date, d.minutes])).toEqual([
      ["2026-09-01", 45],
      ["2026-09-02", 60],
    ]);
    expect(buildTimesheetPayload(berlin, 15)).toEqual([
      {
        date: "2026-09-02",
        hours: "1:45",
        text: "Theta | 6: Hotfix # Nachts, Tagsüber",
        travelFee: false,
      },
    ]);
  });

  it("nutzt Berliner Uhrzeiten für fehlende Notizen", () => {
    const days = aggregateTimesheet(
      normalizeRawRecords([
        {
          activityTitle: "Alpha | 101: Backend",
          startDate: "2026-01-15T00:30:00+01:00",
          endDate: "2026-01-15T01:00:00+01:00",
        },
      ]),
    );
    expect(days[0].missingEntries).toEqual([
      {
        activity: "Alpha | 101: Backend",
        start: "00:30",
        end: "01:00",
        isCritical: true,
      },
    ]);
  });

  it("rechnet am Tag der Zeitumstellung mit echten Minuten", () => {
    // 2026-03-29: 02:00 MEZ → 03:00 MESZ
    const days = aggregateTimesheet(
      normalizeRawRecords([
        {
          activityTitle: "Alpha | 101: Backend",
          startDate: "2026-03-29T01:30:00+01:00",
          endDate: "2026-03-29T03:30:00+02:00",
          notes: "Umstellung",
        },
      ]),
    );
    expect(days.map((d) => [d.date, d.minutes])).toEqual([["2026-03-29", 60]]);
  });
});

describe("Formatierung", () => {
  it.each<[number, Rounding, string]>([
    [372, 15, "6:15"],
    [7, 15, "0:00"],
    [8, 15, "0:15"],
    [38, 30, "0:30"],
    [45, 30, "1:00"],
    [30, 60, "1:00"],
    [29, 60, "0:00"],
    [612, 5, "10:10"],
    [615, 10, "10:20"],
  ])("formatMinutes(%i, %i) = %s", (minutes, rounding, expected) => {
    expect(formatMinutes(minutes, rounding)).toBe(expected);
  });

  it("Einzelzeile ohne Meeting-Gruppierung", () => {
    expect(
      formatActivityLine({ title: "Meetings(Daily)", notes: ["a", "b"] }),
    ).toBe("Meetings(Daily) # a, b");
    expect(formatActivityLine({ title: "Alpha", notes: [] })).toBe("Alpha");
  });

  it("Overrides schalten travelFee pro Datum", () => {
    const days = portDays(exampleB);
    const payload = buildTimesheetPayload(days, 15, {
      "2026-03-02": true,
      "2026-03-03": false,
    });
    expect(payload.map((p) => p.travelFee)).toEqual([true, false]);
  });
});
