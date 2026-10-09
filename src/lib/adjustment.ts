import { EntrySource, type Prisma, type TimeEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Alter Text-Marker des Anfangs-Überstunden-Saldos (Fallback für Altdaten). */
export const ADJUSTMENT_MARKER = "Anfangs-Überstunden-Saldo";

type TimeEntryReader = {
  timeEntry: Pick<Prisma.TransactionClient["timeEntry"], "findFirst">;
};

/**
 * Sucht den Saldo-Eintrag eines Users: primär über source=ADJUSTMENT,
 * sonst über den alten Teilstring in der description.
 */
export async function findAdjustmentEntry(
  userId: string,
  client: TimeEntryReader = prisma,
): Promise<TimeEntry | null> {
  const bySource = await client.timeEntry.findFirst({
    where: { userId, source: EntrySource.ADJUSTMENT },
    orderBy: { date: "asc" },
  });
  if (bySource) return bySource;

  return client.timeEntry.findFirst({
    where: { userId, description: { contains: ADJUSTMENT_MARKER } },
    orderBy: { date: "asc" },
  });
}

/**
 * Filter „kein Saldo-Eintrag“: über source, für Altdaten zusätzlich über den
 * Text-Marker. Einträge ohne description bleiben drin – ein reines SQL-NOT
 * (`NOT description LIKE …`) würde sie wegen NULL stillschweigend verwerfen.
 */
export function excludeAdjustmentFilter(): Prisma.TimeEntryWhereInput {
  return {
    source: { not: EntrySource.ADJUSTMENT },
    OR: [
      { description: null },
      { NOT: { description: { contains: ADJUSTMENT_MARKER } } },
    ],
  };
}
