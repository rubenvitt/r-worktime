// CSV-Export der Berichte für Excel/Numbers auf Deutsch: Semikolon als
// Trenner, Dezimalkomma, UTF-8 mit BOM und CRLF. Rein, auch im Client nutzbar.

/** Byte Order Mark, damit Excel die Datei als UTF-8 erkennt. */
export const CSV_BOM = "﻿";

/**
 * Ein Feld: Formel-Präfixe werden entschärft (CSV-Injection in
 * Tabellenkalkulationen), Trenner, Anführungszeichen und Umbrüche gequotet.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Zeilen zu einer CSV-Datei; jedes Feld läuft durch csvField. */
export function buildCsv(rows: string[][]): string {
  return CSV_BOM + rows.map((row) => row.map(csvField).join(";")).join("\r\n");
}

const hoursFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

/** Minuten als Dezimalstunden mit Komma: 90 → "1,50" */
export function csvHours(minutes: number): string {
  return hoursFormatter.format(minutes / 60);
}

/** "2026-10-09" → "09.10.2026" */
export function csvDate(key: string): string {
  return `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}`;
}
