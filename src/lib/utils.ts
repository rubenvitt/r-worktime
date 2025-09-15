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
  const absHours = Math.abs(hours);
  const wholeHours = Math.floor(absHours);
  const minutes = Math.round((absHours - wholeHours) * 60);

  // Formatiere Stunden und Minuten mit führenden Nullen
  const hoursStr = wholeHours.toString().padStart(2, "0");
  const minutesStr = minutes.toString().padStart(2, "0");

  return hours < 0 ? `-${hoursStr}:${minutesStr}` : `${hoursStr}:${minutesStr}`;
}

/**
 * Formatiert Dezimalstunden mit explizitem Vorzeichen für Überstunden
 * z.B. 1.5 → "+01:30", -2.25 → "-02:15", 0 → "±00:00"
 */
export function formatOvertimeHours(hours: number): string {
  // Spezialbehandlung für 0
  if (hours === 0) {
    return "±00:00";
  }

  const formatted = formatHoursToTime(hours);
  return hours > 0 && !formatted.startsWith("-") ? `+${formatted}` : formatted;
}
