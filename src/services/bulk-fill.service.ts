import type { Prisma } from "@prisma/client";
import { addDays, endOfDay, format, isWeekend, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { EntryType } from "@/types/database";

export interface BulkFillRequest {
  userId: string;
  startDate: Date;
  endDate: Date;
  dailyHours: number;
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  description?: string;
  skipExisting: boolean;
}

export interface BulkFillResponse {
  created: number;
  skipped: number;
  skipReasons: {
    weekend: number;
    holiday: number;
    existing: number;
  };
}

export class BulkFillService {
  /**
   * Befüllt alle Arbeitstage in einem Zeitraum mit Standard-Arbeitszeiten
   * Überspringt Wochenenden, Feiertage und existierende Einträge
   */
  async fillWorkdays(request: BulkFillRequest): Promise<BulkFillResponse> {
    const {
      userId,
      startDate,
      endDate,
      dailyHours,
      startTime,
      endTime,
      description = "Bulk-Fill Arbeitszeit",
      skipExisting,
    } = request;

    // Validierung
    if (startDate > endDate) {
      throw new Error("Startdatum muss vor dem Enddatum liegen");
    }

    // Max 1 Jahr Zeitraum
    const daysDiff = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysDiff > 365) {
      throw new Error("Maximaler Zeitraum ist 1 Jahr");
    }

    // Validiere Zeiten
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    if (
      startHour >= endHour ||
      (startHour === endHour && startMinute >= endMinute)
    ) {
      throw new Error("Startzeit muss vor der Endzeit liegen");
    }

    const response: BulkFillResponse = {
      created: 0,
      skipped: 0,
      skipReasons: {
        weekend: 0,
        holiday: 0,
        existing: 0,
      },
    };

    // Hole alle Feiertage im Zeitraum
    const holidays = await prisma.timeEntry.findMany({
      where: {
        userId,
        type: EntryType.HOLIDAY,
        date: {
          gte: startOfDay(startDate),
          lte: endOfDay(endDate),
        },
      },
      select: {
        date: true,
      },
    });

    const holidayDates = new Set(
      holidays.map((h) => format(h.date, "yyyy-MM-dd")),
    );

    // Hole alle existierenden Einträge im Zeitraum
    const existingEntries = skipExisting
      ? await prisma.timeEntry.findMany({
          where: {
            userId,
            date: {
              gte: startOfDay(startDate),
              lte: endOfDay(endDate),
            },
          },
          select: {
            date: true,
          },
        })
      : [];

    const existingDates = new Set(
      existingEntries.map((e) => format(e.date, "yyyy-MM-dd")),
    );

    // Erstelle Array mit allen zu erstellenden Einträgen
    const entriesToCreate: Prisma.TimeEntryCreateManyInput[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateString = format(currentDate, "yyyy-MM-dd");

      // Prüfe ob Wochenende
      if (isWeekend(currentDate)) {
        response.skipReasons.weekend++;
        response.skipped++;
      }
      // Prüfe ob Feiertag
      else if (holidayDates.has(dateString)) {
        response.skipReasons.holiday++;
        response.skipped++;
      }
      // Prüfe ob bereits existiert
      else if (skipExisting && existingDates.has(dateString)) {
        response.skipReasons.existing++;
        response.skipped++;
      }
      // Erstelle Eintrag
      else {
        const entryDate = new Date(currentDate);
        entryDate.setHours(0, 0, 0, 0);

        const entryStartTime = new Date(currentDate);
        entryStartTime.setHours(startHour, startMinute, 0, 0);

        const entryEndTime = new Date(currentDate);
        entryEndTime.setHours(endHour, endMinute, 0, 0);

        entriesToCreate.push({
          userId,
          date: entryDate,
          startTime: entryStartTime,
          endTime: entryEndTime,
          duration: dailyHours,
          type: EntryType.WORK,
          description,
        });
      }

      currentDate = addDays(currentDate, 1);
    }

    // Batch-Insert mit Transaction für Atomizität
    if (entriesToCreate.length > 0) {
      try {
        await prisma.$transaction(async (tx) => {
          // Verwende createMany für bessere Performance
          await tx.timeEntry.createMany({
            data: entriesToCreate,
            skipDuplicates: true, // Falls doch Duplikate auftreten
          });
        });

        response.created = entriesToCreate.length;
      } catch (error) {
        console.error("Fehler beim Bulk-Insert:", error);
        throw new Error("Fehler beim Erstellen der Zeiteinträge");
      }
    }

    return response;
  }

  /**
   * Berechnet eine Vorschau der zu erstellenden Einträge ohne sie zu speichern
   */
  async previewBulkFill(request: BulkFillRequest): Promise<BulkFillResponse> {
    const { userId, startDate, endDate, skipExisting } = request;

    const response: BulkFillResponse = {
      created: 0,
      skipped: 0,
      skipReasons: {
        weekend: 0,
        holiday: 0,
        existing: 0,
      },
    };

    // Hole alle Feiertage im Zeitraum
    const holidays = await prisma.timeEntry.findMany({
      where: {
        userId,
        type: EntryType.HOLIDAY,
        date: {
          gte: startOfDay(startDate),
          lte: endOfDay(endDate),
        },
      },
      select: {
        date: true,
      },
    });

    const holidayDates = new Set(
      holidays.map((h) => format(h.date, "yyyy-MM-dd")),
    );

    // Hole alle existierenden Einträge im Zeitraum
    const existingEntries = skipExisting
      ? await prisma.timeEntry.findMany({
          where: {
            userId,
            date: {
              gte: startOfDay(startDate),
              lte: endOfDay(endDate),
            },
          },
          select: {
            date: true,
          },
        })
      : [];

    const existingDates = new Set(
      existingEntries.map((e) => format(e.date, "yyyy-MM-dd")),
    );

    // Zähle die Tage
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateString = format(currentDate, "yyyy-MM-dd");

      if (isWeekend(currentDate)) {
        response.skipReasons.weekend++;
        response.skipped++;
      } else if (holidayDates.has(dateString)) {
        response.skipReasons.holiday++;
        response.skipped++;
      } else if (skipExisting && existingDates.has(dateString)) {
        response.skipReasons.existing++;
        response.skipped++;
      } else {
        response.created++;
      }

      currentDate = addDays(currentDate, 1);
    }

    return response;
  }
}

export const bulkFillService = new BulkFillService();
