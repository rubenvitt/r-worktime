import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildAbsenceReport } from "@/lib/reports/absences";
import { AbsencesCalendar } from "./absences-calendar";
import { AbsencesTable } from "./absences-table";

// Rauchtest ohne Browser: Kalender und Tabelle rendern mit echten Berichtsdaten.

const report = buildAbsenceReport({
  year: 2026,
  todayKey: "2026-10-10",
  settings: {
    weeklyWorkHours: 40,
    workDays: [1, 2, 3, 4, 5],
    annualVacationDays: 30,
  },
  entries: [
    { dateKey: "2026-08-21", type: "VACATION", hours: 8 },
    { dateKey: "2026-09-15", type: "SICK", hours: 8 },
    { dateKey: "2026-12-24", type: "VACATION", hours: 4 },
  ],
  reviewedDays: [{ dateKey: "2026-04-07", reason: "Unbezahlter Urlaub" }],
});

describe("AbsencesCalendar", () => {
  const html = renderToStaticMarkup(
    createElement(AbsencesCalendar, {
      year: report.year,
      todayKey: report.todayKey,
      days: report.days,
      workDays: report.workDays,
    }),
  );

  it("zeigt 12 Monate und eine Schaltfläche je Abwesenheitstag", () => {
    expect(html.match(/<section/g)).toHaveLength(12);
    expect(html.match(/<button/g)).toHaveLength(4);
  });

  it("beschreibt Tage im aria-label", () => {
    expect(html).toContain(
      'aria-label="Fr 21.08. · Urlaub 8:00 h · zählt 1 Tag"',
    );
    expect(html).toContain(
      'aria-label="Do 24.12. · Urlaub 4:00 h · geplant · zählt 0,5 Tage"',
    );
    expect(html).toContain('aria-label="August: 1 Tag"');
  });
});

describe("AbsencesTable", () => {
  it("zeigt Monate, geplanten Urlaub und die Jahressumme", () => {
    const html = renderToStaticMarkup(
      createElement(AbsencesTable, {
        months: report.months,
        totals: report.totals.days,
        showUnpaid: true,
      }),
    );
    expect(html.match(/<tr/g)).toHaveLength(14);
    expect(html).toContain("Dezember");
    expect(html).toContain("(0,5 geplant)");
    expect(html).toContain("Unbezahlt");
  });
});

describe("AbsencesTable mit Sonderurlaub und Überstundenabbau", () => {
  it("zeigt die zusätzlichen Spalten und zählt sie in die Summe", () => {
    const withKinds = buildAbsenceReport({
      year: 2026,
      todayKey: "2026-10-10",
      settings: {
        weeklyWorkHours: 40,
        workDays: [1, 2, 3, 4, 5],
        annualVacationDays: 30,
      },
      entries: [
        {
          dateKey: "2026-03-02",
          type: "VACATION",
          hours: 8,
          kind: "SPECIAL_LEAVE",
        },
        { dateKey: "2026-03-03", type: "OVERTIME_REDUCTION", hours: 8 },
      ],
      reviewedDays: [],
    });
    const html = renderToStaticMarkup(
      createElement(AbsencesTable, {
        months: withKinds.months,
        totals: withKinds.totals.days,
        showUnpaid: false,
        showSpecial: true,
        showOvertimeReduction: true,
      }),
    );
    expect(html).toContain("Sonder-/Bildungsurlaub");
    expect(html).toContain("Überstundenabbau");
    expect(html).not.toContain("Unbezahlt");
    // März: 1 + 1 = 2 Tage Summe
    expect(html).toMatch(/März<\/th>.*?>2<\/td><\/tr>/);
  });
});
