// Abwesenheitsarten: Zuordnung des Timewarp-Typtexts und die Regeln je Art
// (Regeltabelle der Spec docs/superpowers/specs/2026-10-11-timewarp-absences-design.md).
// Reine Funktionen; Abgleich, Dialog, Berichte und Saldo lesen die Regeln hier.

import type { AbsenceKind as PrismaAbsenceKind } from "@prisma/client";

export type AbsenceKind = PrismaAbsenceKind;

export const ABSENCE_KINDS = [
  "VACATION",
  "RESIDUAL_VACATION",
  "SPECIAL_LEAVE",
  "EDUCATIONAL_LEAVE",
  "OVERTIME_REDUCTION",
  "UNPAID_LEAVE",
  "PARENTAL_LEAVE",
  "MATERNITY_LEAVE",
  "SABBATICAL",
] as const satisfies readonly AbsenceKind[];

/** Eintragstyp, den die Tage einer Abwesenheit bekommen */
export type AbsenceEntryKind =
  | "VACATION"
  | "OVERTIME_REDUCTION"
  | "UNPAID_LEAVE";

export const KIND_LABELS: Record<AbsenceKind, string> = {
  VACATION: "Urlaub",
  RESIDUAL_VACATION: "Resturlaub",
  SPECIAL_LEAVE: "Sonderurlaub",
  EDUCATIONAL_LEAVE: "Bildungsurlaub",
  OVERTIME_REDUCTION: "Überstundenabbau",
  UNPAID_LEAVE: "Unbezahlter Urlaub",
  PARENTAL_LEAVE: "Elternzeit",
  MATERNITY_LEAVE: "Mutterschutz",
  SABBATICAL: "Sabbatical",
};

/** Vereinheitlichter Typtext (ohne Umlaute, Leerzeichen, Bindestriche) → Art */
const TIMEWARP_TYPES: Record<string, AbsenceKind> = {
  urlaub: "VACATION",
  resturlaub: "RESIDUAL_VACATION",
  sonderurlaub: "SPECIAL_LEAVE",
  bildungsurlaub: "EDUCATIONAL_LEAVE",
  ueberstundenabbau: "OVERTIME_REDUCTION",
  unbezahlterurlaub: "UNPAID_LEAVE",
  elternzeit: "PARENTAL_LEAVE",
  mutterschutz: "MATERNITY_LEAVE",
  sabbatical: "SABBATICAL",
};

function normalizeTypeText(raw: string): string {
  return raw
    .normalize("NFC")
    .toLowerCase()
    .replace(/\(\s*halber\s+tag\s*\)/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[\s\-_]+/g, "");
}

/**
 * Timewarp-Typtext (aus SUMMARY nach dem Namen, z. B. „URLAUB“,
 * „UEBERSTUNDENABBAU“) → Art. Events und unbekannte Typen → null.
 */
export function parseTimewarpType(raw: string): AbsenceKind | null {
  return TIMEWARP_TYPES[normalizeTypeText(raw)] ?? null;
}

export function isAbsenceKind(value: unknown): value is AbsenceKind {
  return (
    typeof value === "string" &&
    (ABSENCE_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Eintragstyp je Art: Urlaubsarten → VACATION (Gutschrift bis Tagessoll),
 * Überstundenabbau → OVERTIME_REDUCTION (Soll bleibt), alle unbezahlten
 * Arten → UNPAID_LEAVE (Soll 0).
 */
export function entryTypeForKind(kind: AbsenceKind): AbsenceEntryKind {
  switch (kind) {
    case "VACATION":
    case "RESIDUAL_VACATION":
    case "SPECIAL_LEAVE":
    case "EDUCATIONAL_LEAVE":
      return "VACATION";
    case "OVERTIME_REDUCTION":
      return "OVERTIME_REDUCTION";
    case "UNPAID_LEAVE":
    case "PARENTAL_LEAVE":
    case "MATERNITY_LEAVE":
    case "SABBATICAL":
      return "UNPAID_LEAVE";
  }
}

/** Belastet das Urlaubskonto: nur Urlaub und Resturlaub. */
export function countsAgainstEntitlement(kind: AbsenceKind): boolean {
  return kind === "VACATION" || kind === "RESIDUAL_VACATION";
}

/** Bekommt einen Eintrag in Timing: alle Arten mit Eintragstyp VACATION. */
export function writesToTiming(kind: AbsenceKind): boolean {
  return entryTypeForKind(kind) === "VACATION";
}
