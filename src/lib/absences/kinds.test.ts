import { describe, expect, it } from "vitest";
import {
  ABSENCE_KINDS,
  type AbsenceKind,
  countsAgainstEntitlement,
  entryTypeForKind,
  isAbsenceKind,
  KIND_LABELS,
  parseTimewarpType,
  writesToTiming,
} from "./kinds";

describe("parseTimewarpType", () => {
  it.each<[string, AbsenceKind]>([
    ["URLAUB", "VACATION"],
    ["RESTURLAUB", "RESIDUAL_VACATION"],
    ["SONDERURLAUB", "SPECIAL_LEAVE"],
    ["BILDUNGSURLAUB", "EDUCATIONAL_LEAVE"],
    ["ÜBERSTUNDENABBAU", "OVERTIME_REDUCTION"],
    ["UNBEZAHLTER URLAUB", "UNPAID_LEAVE"],
    ["ELTERNZEIT", "PARENTAL_LEAVE"],
    ["MUTTERSCHUTZ", "MATERNITY_LEAVE"],
    ["SABBATICAL", "SABBATICAL"],
  ])("erkennt %s", (raw, kind) => {
    expect(parseTimewarpType(raw)).toBe(kind);
  });

  it("ignoriert Groß-/Kleinschreibung", () => {
    expect(parseTimewarpType("Urlaub")).toBe("VACATION");
    expect(parseTimewarpType("resturlaub")).toBe("RESIDUAL_VACATION");
    expect(parseTimewarpType("Überstundenabbau")).toBe("OVERTIME_REDUCTION");
  });

  it("vereinheitlicht Umlaute (ü/ue, auch zerlegt geschrieben)", () => {
    expect(parseTimewarpType("UEBERSTUNDENABBAU")).toBe("OVERTIME_REDUCTION");
    expect(parseTimewarpType("ueberstundenabbau")).toBe("OVERTIME_REDUCTION");
    // „U“ + kombinierendes Trema (NFD)
    expect(parseTimewarpType("ÜBERSTUNDENABBAU")).toBe("OVERTIME_REDUCTION");
  });

  it("toleriert Leerzeichen und Bindestriche", () => {
    expect(parseTimewarpType("  URLAUB  ")).toBe("VACATION");
    expect(parseTimewarpType("UNBEZAHLTER   URLAUB")).toBe("UNPAID_LEAVE");
    expect(parseTimewarpType("UNBEZAHLTERURLAUB")).toBe("UNPAID_LEAVE");
    expect(parseTimewarpType("Überstunden-Abbau")).toBe("OVERTIME_REDUCTION");
    expect(parseTimewarpType("Bildungs urlaub")).toBe("EDUCATIONAL_LEAVE");
  });

  it("toleriert ein verbliebenes „(halber Tag)“", () => {
    expect(parseTimewarpType("RESTURLAUB (halber Tag)")).toBe(
      "RESIDUAL_VACATION",
    );
  });

  it("liefert null für Events und unbekannte Typen", () => {
    expect(parseTimewarpType("Event in Köln")).toBeNull();
    expect(parseTimewarpType("EVENT")).toBeNull();
    expect(parseTimewarpType("KRANKHEIT")).toBeNull();
    expect(parseTimewarpType("")).toBeNull();
    expect(parseTimewarpType("   ")).toBeNull();
  });
});

describe("Regeln je Art (Regeltabelle der Spec)", () => {
  const table: Record<
    AbsenceKind,
    {
      entryType: "VACATION" | "OVERTIME_REDUCTION" | "UNPAID_LEAVE";
      entitlement: boolean;
      timing: boolean;
    }
  > = {
    VACATION: { entryType: "VACATION", entitlement: true, timing: true },
    RESIDUAL_VACATION: {
      entryType: "VACATION",
      entitlement: true,
      timing: true,
    },
    SPECIAL_LEAVE: { entryType: "VACATION", entitlement: false, timing: true },
    EDUCATIONAL_LEAVE: {
      entryType: "VACATION",
      entitlement: false,
      timing: true,
    },
    OVERTIME_REDUCTION: {
      entryType: "OVERTIME_REDUCTION",
      entitlement: false,
      timing: false,
    },
    UNPAID_LEAVE: {
      entryType: "UNPAID_LEAVE",
      entitlement: false,
      timing: false,
    },
    PARENTAL_LEAVE: {
      entryType: "UNPAID_LEAVE",
      entitlement: false,
      timing: false,
    },
    MATERNITY_LEAVE: {
      entryType: "UNPAID_LEAVE",
      entitlement: false,
      timing: false,
    },
    SABBATICAL: {
      entryType: "UNPAID_LEAVE",
      entitlement: false,
      timing: false,
    },
  };

  it("deckt alle Arten ab", () => {
    expect([...ABSENCE_KINDS].sort()).toEqual(Object.keys(table).sort());
  });

  it.each(ABSENCE_KINDS)("%s", (kind) => {
    expect(entryTypeForKind(kind)).toBe(table[kind].entryType);
    expect(countsAgainstEntitlement(kind)).toBe(table[kind].entitlement);
    expect(writesToTiming(kind)).toBe(table[kind].timing);
  });
});

describe("KIND_LABELS", () => {
  it("beschriftet jede Art deutsch", () => {
    expect(KIND_LABELS).toEqual({
      VACATION: "Urlaub",
      RESIDUAL_VACATION: "Resturlaub",
      SPECIAL_LEAVE: "Sonderurlaub",
      EDUCATIONAL_LEAVE: "Bildungsurlaub",
      OVERTIME_REDUCTION: "Überstundenabbau",
      UNPAID_LEAVE: "Unbezahlter Urlaub",
      PARENTAL_LEAVE: "Elternzeit",
      MATERNITY_LEAVE: "Mutterschutz",
      SABBATICAL: "Sabbatical",
    });
  });
});

describe("isAbsenceKind", () => {
  it("prüft Rohwerte", () => {
    expect(isAbsenceKind("SPECIAL_LEAVE")).toBe(true);
    expect(isAbsenceKind("SICK")).toBe(false);
    expect(isAbsenceKind(null)).toBe(false);
  });
});
