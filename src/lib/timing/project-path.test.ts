import { describe, expect, it } from "vitest";
import {
  joinTitleChain,
  matchesProjectRoot,
  splitProjectPath,
} from "./project-path";

describe("joinTitleChain", () => {
  it("verbindet Segmente mit ▸", () => {
    expect(joinTitleChain(["Work", "Firma", "Kunde A"])).toBe(
      "Work ▸ Firma ▸ Kunde A",
    );
  });

  it("ignoriert leere Segmente und trimmt", () => {
    expect(joinTitleChain([" Work ", "", "Kunde A"])).toBe("Work ▸ Kunde A");
    expect(joinTitleChain([])).toBe("");
  });

  it("ist mit splitProjectPath umkehrbar", () => {
    const chain = ["Work", "Firma", "Kunde A"];
    expect(splitProjectPath(joinTitleChain(chain))).toEqual(chain);
  });
});

describe("matchesProjectRoot", () => {
  it("matcht die Wurzel selbst und Unterprojekte", () => {
    expect(matchesProjectRoot("Work", ["Work"])).toBe(true);
    expect(matchesProjectRoot("Work ▸ Firma ▸ Kunde A", ["Work"])).toBe(true);
  });

  it("matcht keine Präfixe innerhalb eines Segments", () => {
    expect(matchesProjectRoot("Workshop", ["Work"])).toBe(false);
    expect(matchesProjectRoot("Workshop ▸ Alpha", ["Work"])).toBe(false);
  });

  it("vergleicht mehrteilige Wurzeln segmentweise", () => {
    expect(matchesProjectRoot("Work ▸ Firma ▸ Kunde A", ["Work ▸ Firma"])).toBe(
      true,
    );
    expect(matchesProjectRoot("Work ▸ Firmenwagen", ["Work ▸ Firma"])).toBe(
      false,
    );
    expect(matchesProjectRoot("Work", ["Work ▸ Firma"])).toBe(false);
  });

  it("prüft mehrere Wurzeln", () => {
    expect(matchesProjectRoot("Privat ▸ Sport", ["Work", "Privat"])).toBe(true);
    expect(matchesProjectRoot("Hobby", ["Work", "Privat"])).toBe(false);
  });

  it("liefert false für leere Pfade oder Wurzeln", () => {
    expect(matchesProjectRoot("", ["Work"])).toBe(false);
    expect(matchesProjectRoot("Work", [])).toBe(false);
    expect(matchesProjectRoot("Work", [""])).toBe(false);
  });

  it("ist groß-/kleinschreibungssensitiv", () => {
    expect(matchesProjectRoot("work ▸ Kunde A", ["Work"])).toBe(false);
  });
});
