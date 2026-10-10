import { describe, expect, it } from "vitest";
import {
  BILLING_CLASS_LABELS,
  BILLING_STATUS_CLASS,
  BILLING_STATUS_LABELS,
  BILLING_STATUS_ORDER,
  billableShare,
  classifyBillingStatus,
  normalizeBillingStatus,
} from "./billing-status";

describe("classifyBillingStatus", () => {
  it("ordnet die Timing-Werte zu", () => {
    expect(classifyBillingStatus("billable")).toBe("billable");
    expect(classifyBillingStatus("billed")).toBe("billable");
    expect(classifyBillingStatus("paid")).toBe("billable");
    expect(classifyBillingStatus("not_billable")).toBe("nonBillable");
  });

  it("versteht Schreibweisen aus dem Datei-Import", () => {
    expect(classifyBillingStatus("Billable")).toBe("billable");
    expect(classifyBillingStatus("Not Billable")).toBe("nonBillable");
    expect(classifyBillingStatus(" not-billable ")).toBe("nonBillable");
    expect(classifyBillingStatus("NON_BILLABLE")).toBe("nonBillable");
  });

  it("verwechselt „unbilled“ (offen) nicht mit „unbillable“", () => {
    expect(classifyBillingStatus("unbilled")).toBe("billable");
    expect(classifyBillingStatus("unbillable")).toBe("nonBillable");
  });

  it("liefert unknown für leere und unbekannte Werte", () => {
    expect(classifyBillingStatus(null)).toBe("unknown");
    expect(classifyBillingStatus(undefined)).toBe("unknown");
    expect(classifyBillingStatus("")).toBe("unknown");
    expect(classifyBillingStatus("undetermined")).toBe("unknown");
    expect(classifyBillingStatus("irgendwas")).toBe("unknown");
  });
});

describe("normalizeBillingStatus", () => {
  it("unterscheidet abrechenbare Stunden nach Status", () => {
    expect(normalizeBillingStatus("billable")).toBe("open");
    expect(normalizeBillingStatus("unbilled")).toBe("open");
    expect(normalizeBillingStatus("Billed")).toBe("billed");
    expect(normalizeBillingStatus("paid")).toBe("paid");
    expect(normalizeBillingStatus("not_billable")).toBe("notBillable");
    expect(normalizeBillingStatus(null)).toBe("unknown");
  });

  it("hat Labels und Klasse für jeden Status", () => {
    for (const status of BILLING_STATUS_ORDER) {
      expect(BILLING_STATUS_LABELS[status]).toBeTruthy();
      expect(BILLING_CLASS_LABELS[BILLING_STATUS_CLASS[status]]).toBeTruthy();
    }
    expect(BILLING_STATUS_LABELS.open).toBe("Offen");
    expect(BILLING_CLASS_LABELS.nonBillable).toBe("Nicht abrechenbar");
  });
});

describe("billableShare", () => {
  it("rechnet abrechenbar / gesamt, ohne Status zählt im Nenner mit", () => {
    // 6 h abrechenbar, 2 h nicht abrechenbar, 2 h ohne Status
    expect(billableShare(6, 10)).toBe(0.6);
    expect(billableShare(0, 0)).toBeNull();
  });
});
