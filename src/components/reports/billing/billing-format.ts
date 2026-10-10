// Darstellung für den Abrechnungsbericht (Anteile, Farben, Rohwerte).

import type { BillingStatus } from "@/lib/reports/billing-status";

/** Farbe je Status, nur vorhandene Design-Tokens. */
export const BILLING_STATUS_COLORS: Record<BillingStatus, string> = {
  open: "var(--warning)",
  billed: "var(--chart-actual)",
  paid: "var(--positive)",
  notBillable: "var(--chart-target)",
  unknown: "var(--muted-foreground)",
};

/** Rohwert für die Anzeige; null → „kein Wert“. */
export function rawValueLabel(raw: string | null): string {
  return raw === null ? "kein Wert" : raw;
}
