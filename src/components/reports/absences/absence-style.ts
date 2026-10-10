// Farben, Beschriftungen und Formatierung für den Abwesenheitsbericht.

import { formatDateShort, formatDecimal, formatHours } from "@/lib/format";
import {
  ABSENCE_CATEGORIES,
  ABSENCE_CATEGORY_LABELS,
  type AbsenceCategory,
  type AbsenceDay,
} from "@/lib/reports/absences";

/**
 * Farbe je Kategorie als CSS-Variable. Rot bleibt Defiziten vorbehalten,
 * deshalb ist Krankheit gelb.
 */
export const CATEGORY_COLOR: Record<AbsenceCategory, string> = {
  vacation: "var(--chart-actual)",
  sick: "var(--warning)",
  holiday: "var(--positive)",
  unpaid: "var(--chart-axis)",
};

/** Deckkraft für geplanten (zukünftigen) Urlaub */
export const PLANNED_OPACITY = 0.45;

const WEEKDAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** 1 → "1 Tag", 2.5 → "2,5 Tage", -1 → "−1 Tag" */
export function formatDays(days: number): string {
  const abs = Math.abs(days);
  const text = `${days < 0 ? "−" : ""}${formatDecimal(abs, 1)}`;
  return `${text} ${abs === 1 ? "Tag" : "Tage"}`;
}

/** 0 → "—", sonst Zahl ohne Einheit ("1,5") */
export function formatDayCount(days: number): string {
  return days === 0 ? "—" : formatDecimal(days, 1);
}

/** 8 → "8:00 h" */
export function formatHoursLabel(hours: number): string {
  return `${formatHours(hours)} h`;
}

/** [1,2,3,4,5] → "Mo–Fr", [1,3,5] → "Mo, Mi, Fr" */
export function formatWorkDays(workDays: readonly number[]): string {
  // Montag zuerst
  const sorted = [...workDays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (sorted.length === 0) return "keine";
  const positions = sorted.map((d) => (d + 6) % 7);
  const contiguous = positions.every(
    (pos, index) => index === 0 || pos === positions[index - 1] + 1,
  );
  if (contiguous && sorted.length >= 3) {
    return `${WEEKDAY_NAMES[sorted[0]]}–${WEEKDAY_NAMES[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => WEEKDAY_NAMES[d]).join(", ");
}

export const SETTINGS_VACATION_HREF = "/settings/overtime#urlaub";

/**
 * Beschreibung eines Abwesenheitstags für Tooltip, aria-label und Detailzeile,
 * z. B. „Mo 03.08. · Urlaub 8:00 h · geplant · zählt 1 Tag“.
 */
export function describeAbsenceDay(day: AbsenceDay): string {
  const parts = [formatDateShort(day.dateKey)];
  for (const category of ABSENCE_CATEGORIES) {
    if (category === "unpaid") {
      if (day.days.unpaid > 0) parts.push("Unbezahlter Urlaub (geprüfter Tag)");
      continue;
    }
    if (day.hours[category] > 0) {
      parts.push(
        `${ABSENCE_CATEGORY_LABELS[category]} ${formatHoursLabel(day.hours[category])}`,
      );
    }
  }
  if (day.isFuture && day.days.vacation > 0) parts.push("geplant");
  if (!day.isWorkDay) {
    parts.push("kein Arbeitstag, nicht gezählt");
  } else {
    const counted = ABSENCE_CATEGORIES.filter((c) => day.days[c] > 0);
    if (counted.length === 1) {
      parts.push(`zählt ${formatDays(day.days[counted[0]])}`);
    } else if (counted.length > 1) {
      parts.push(
        `zählt ${counted
          .map(
            (c) => `${formatDays(day.days[c])} ${ABSENCE_CATEGORY_LABELS[c]}`,
          )
          .join(" + ")}`,
      );
    } else {
      parts.push("nicht gezählt");
    }
  }
  return parts.join(" · ");
}
