import { formatDateKey } from "@/components/week/week-utils";

/** Kontext zum Saldo: „seit 02.08.2026, inkl. Anfangs-Saldo“ bzw. „ohne Anfangs-Saldo“. */
export function saldoContext(adjustmentDate: string | null): string {
  return adjustmentDate
    ? `seit ${formatDateKey(adjustmentDate)}, inkl. Anfangs-Saldo`
    : "ohne Anfangs-Saldo";
}

/** Tone für einen Saldo nach Vorzeichen (auf Minuten gerundet). */
export function deltaTone(
  minutes: number,
): "neutral" | "positive" | "negative" {
  const rounded = Math.round(minutes);
  if (rounded > 0) return "positive";
  if (rounded < 0) return "negative";
  return "neutral";
}
