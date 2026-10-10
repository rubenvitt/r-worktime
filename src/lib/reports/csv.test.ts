import { describe, expect, it } from "vitest";
import { buildCsv, CSV_BOM, csvDate, csvField, csvHours } from "./csv";

describe("CSV", () => {
  it("quotet Trenner, Anführungszeichen und Umbrüche", () => {
    expect(csvField("Kunde A")).toBe("Kunde A");
    expect(csvField("A;B")).toBe('"A;B"');
    expect(csvField('Sag "Hallo"')).toBe('"Sag ""Hallo"""');
    expect(csvField("Zeile\nZwei")).toBe('"Zeile\nZwei"');
  });

  it("entschärft Formel-Präfixe", () => {
    expect(csvField("=SUMME(A1)")).toBe("'=SUMME(A1)");
    expect(csvField("-5")).toBe("'-5");
    expect(csvField("@Kunde")).toBe("'@Kunde");
  });

  it("baut eine Datei mit BOM, Semikolon und CRLF", () => {
    expect(
      buildCsv([
        ["Datum", "Stunden"],
        [csvDate("2026-10-09"), csvHours(90)],
      ]),
    ).toBe(`${CSV_BOM}Datum;Stunden\r\n09.10.2026;1,50`);
    expect(csvHours(0)).toBe("0,00");
    expect(csvHours(60 * 1234)).toBe("1234,00");
  });
});
