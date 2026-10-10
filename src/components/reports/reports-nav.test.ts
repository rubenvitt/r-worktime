import { describe, expect, it } from "vitest";
import { REPORT_TABS } from "./reports-nav";

describe("REPORT_TABS", () => {
  it("enthält genau die sechs Berichte unter /reports", () => {
    expect(REPORT_TABS.map((tab) => [tab.label, tab.href])).toEqual([
      ["Projekte", "/reports/projects"],
      ["Abrechnung", "/reports/billing"],
      ["Jahr & Prognose", "/reports/year"],
      ["Abwesenheiten", "/reports/absences"],
      ["Reisetage", "/reports/travel"],
      ["Arbeitszeit", "/reports/patterns"],
    ]);
  });
});
