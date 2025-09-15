import { type ClassValue, clsx } from "clsx";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatiert Dezimalstunden (z.B. 1.5) als HH:mm String (z.B. "01:30")
 * Kann auch große Stundenzahlen (> 24h) verarbeiten
 */
export function formatHoursToTime(hours: number): string {
  // Handle non-finite inputs
  if (!isFinite(hours)) {
    return "--:--";
  }

  // Calculate total minutes with sign preserved
  const totalMinutes = Math.round(hours * 60);
  const isNegative = totalMinutes < 0;
  const absTotalMinutes = Math.abs(totalMinutes);

  // Derive hours and minutes from absolute total
  const wholeHours = Math.floor(absTotalMinutes / 60);
  const minutes = absTotalMinutes % 60;

  // Format with leading zeros
  const hoursStr = wholeHours.toString().padStart(2, "0");
  const minutesStr = minutes.toString().padStart(2, "0");

  // Suppress sign if both hours and minutes are zero
  if (wholeHours === 0 && minutes === 0) {
    return "00:00";
  }

  return isNegative
    ? `-${hoursStr}:${minutesStr}`
    : `${hoursStr}:${minutesStr}`;
}

/**
 * Formatiert Dezimalstunden mit explizitem Vorzeichen für Überstunden
 * z.B. 1.5 → "+01:30", -2.25 → "-02:15", 0 → "±00:00"
 */
export function formatOvertimeHours(hours: number): string {
  // Return "±00:00" for near-zero values
  if (Math.abs(hours) < 1e-6) {
    return "±00:00";
  }

  const formatted = formatHoursToTime(hours);
  return hours > 0 ? `+${formatted}` : formatted;
}
