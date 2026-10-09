import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { ADJUSTMENT_MARKER, excludeAdjustmentFilter } from "./adjustment";

describe("excludeAdjustmentFilter", () => {
  it("schließt den Saldo über source und Textmarker aus", () => {
    const filter = excludeAdjustmentFilter();
    expect(filter.source).toEqual({ not: "ADJUSTMENT" });
    expect(filter.OR).toContainEqual({
      NOT: { description: { contains: ADJUSTMENT_MARKER } },
    });
  });

  it("behält Einträge ohne description (SQL-NOT würde NULL verwerfen)", () => {
    // Altdaten: z. B. Urlaub aus einem Timing-Import ohne Titel und Notiz
    expect(excludeAdjustmentFilter().OR).toContainEqual({ description: null });
  });
});
