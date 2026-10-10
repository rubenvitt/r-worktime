import { describe, expect, it } from "vitest";
import {
  formatDayCount,
  formatDayMonth,
  monthLabel,
  monthShortWithYear,
  niceTicks,
  quarterMonths,
} from "./year-format";

describe("year-format", () => {
  it("beschriftet Monate und Quartale", () => {
    expect(monthLabel("2026-10")).toBe("Okt 2026");
    expect(monthShortWithYear("2026-12", 2026)).toBe("Dez");
    expect(monthShortWithYear("2027-01", 2026)).toBe("Jan 27");
    expect(quarterMonths(3)).toBe("Jul–Sep");
  });

  it("formatiert Quoten, Tage und Datum", () => {
    expect(formatDayCount(1)).toBe("1 Tag");
    expect(formatDayCount(2.5)).toBe("2,5 Tage");
    expect(formatDayMonth("2026-12-25")).toBe("25.12.");
  });

  it("liefert runde Achsenwerte in Stunden inklusive 0", () => {
    expect(niceTicks(-90, 1035)).toEqual([-300, 0, 300, 600, 900, 1200]);
    expect(niceTicks(-556, 0)).toEqual([-720, -540, -360, -180, 0]);
    expect(niceTicks(0, 0)).toEqual([0, 60]);
  });
});
