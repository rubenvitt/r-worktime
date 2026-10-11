import type { QueryClient } from "@tanstack/react-query";

/**
 * Abfragen, die nach geänderten Zeiteinträgen oder Abwesenheiten veraltet
 * sind: Berichte, Abwesenheitsliste, Saldo, Probleme, Monat, Woche, Übersicht.
 * Gilt für den Abwesenheits-Dialog, das Löschen eines Blocks und den
 * Kalender-Abgleich.
 */
export const ENTRY_DEPENDENT_QUERY_KEYS = [
  ["reports"],
  ["absences"],
  ["overtime"],
  ["problems"],
  ["timesheet"],
  ["week-data"],
  ["weekly-stats"],
  ["dashboard"],
] as const;

export function invalidateEntryDependentQueries(queryClient: QueryClient) {
  for (const queryKey of ENTRY_DEPENDENT_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}
