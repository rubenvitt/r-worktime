// Abrechnungsstatus von Zeiteinträgen (reine Funktionen, testbar).
//
// Rohwerte kommen aus zwei Quellen:
// - Timing REST-Sync (`billing_status`): billable, not_billable, billed, paid
//   oder null, solange nichts festgelegt ist.
// - Timing-Datei-Import (`billingStatus`): dieselben Werte, teils groß
//   geschrieben ("Billable") oder mit Leerzeichen ("Not Billable").
// Ältere Daten und der Demo-Seed nutzen "unbilled" für „abrechenbar, noch offen“.

/** Grobe Einteilung für Berichte. */
export type BillingClass = "billable" | "nonBillable" | "unknown";

/** Feinerer Status innerhalb der Einteilung (für „abrechenbar nach Status“). */
export type BillingStatus =
  | "open"
  | "billed"
  | "paid"
  | "notBillable"
  | "unknown";

export const BILLING_CLASS_LABELS: Record<BillingClass, string> = {
  billable: "Abrechenbar",
  nonBillable: "Nicht abrechenbar",
  unknown: "Ohne Status",
};

export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  open: "Offen",
  billed: "Abgerechnet",
  paid: "Bezahlt",
  notBillable: "Nicht abrechenbar",
  unknown: "Ohne Status",
};

/** Reihenfolge für Anzeigen: erst abrechenbar (Offen → Bezahlt), dann der Rest. */
export const BILLING_STATUS_ORDER: readonly BillingStatus[] = [
  "open",
  "billed",
  "paid",
  "notBillable",
  "unknown",
];

export const BILLING_STATUS_CLASS: Record<BillingStatus, BillingClass> = {
  open: "billable",
  billed: "billable",
  paid: "billable",
  notBillable: "nonBillable",
  unknown: "unknown",
};

const STATUS_ALIASES: Record<string, BillingStatus> = {
  billable: "open",
  unbilled: "open",
  open: "open",
  billed: "billed",
  invoiced: "billed",
  paid: "paid",
  not_billable: "notBillable",
  non_billable: "notBillable",
  nonbillable: "notBillable",
  notbillable: "notBillable",
  unbillable: "notBillable",
};

/** "Not Billable", "not-billable", " NOT_BILLABLE " → "not_billable" */
function normalizeRaw(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Rohwert → Status; unbekannte Werte, "undetermined" und null → "unknown". */
export function normalizeBillingStatus(
  status: string | null | undefined,
): BillingStatus {
  if (!status) return "unknown";
  return STATUS_ALIASES[normalizeRaw(status)] ?? "unknown";
}

/** Rohwert → abrechenbar / nicht abrechenbar / unbekannt. */
export function classifyBillingStatus(
  status: string | null | undefined,
): BillingClass {
  return BILLING_STATUS_CLASS[normalizeBillingStatus(status)];
}
