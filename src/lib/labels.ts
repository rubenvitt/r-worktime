// Sichtbare Bezeichnungen für Rohwerte aus API und Datenbank.

export type EntryTypeKey =
  | "WORK"
  | "OVERTIME"
  | "VACATION"
  | "SICK"
  | "HOLIDAY";

export const ENTRY_TYPE_LABEL: Record<EntryTypeKey, string> = {
  WORK: "Arbeit",
  OVERTIME: "Saldo-Buchung",
  VACATION: "Urlaub",
  SICK: "Krank",
  HOLIDAY: "Feiertag",
};

export type EntrySourceKey =
  | "TIMING_SYNC"
  | "MANUAL"
  | "FILE_IMPORT"
  | "BULK_FILL"
  | "HOLIDAY"
  | "ADJUSTMENT";

export const ENTRY_SOURCE_LABEL: Record<EntrySourceKey, string> = {
  TIMING_SYNC: "Timing",
  MANUAL: "Manuell",
  FILE_IMPORT: "Datei-Import",
  BULK_FILL: "Aufgefüllt",
  HOLIDAY: "Feiertag",
  ADJUSTMENT: "Anfangs-Saldo",
};

/** unbilled „Offen“, billed „Abgerechnet“, null „—“, sonst Rohwert */
export function billingStatusLabel(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value === "unbilled") return "Offen";
  if (value === "billed") return "Abgerechnet";
  return value;
}

export type ProblemTypeKey = "missing" | "zero_hours" | "incomplete";

export const PROBLEM_TYPE_LABEL: Record<ProblemTypeKey, string> = {
  missing: "Keine Einträge",
  zero_hours: "0:00 erfasst",
  incomplete: "Unter Soll",
};

export const EXPORT_FORMAT_LABEL: Record<
  "csv" | "xlsx" | "json",
  { label: string; hint: string }
> = {
  csv: { label: "CSV", hint: "für Tabellenkalkulationen" },
  xlsx: { label: "Excel (.xlsx)", hint: "für Excel" },
  json: { label: "JSON", hint: "vollständige Daten" },
};
