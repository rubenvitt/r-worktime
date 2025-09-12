import type { EntryType, TimeEntry } from "@prisma/client";
import { format, isWeekend, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import {
  detectEntryType,
  parseDurationToHours,
  type TimingEntry,
  type TimingExport,
} from "@/lib/schemas/timing-import";

export type WarningType =
  | "WEEKEND"
  | "HOLIDAY"
  | "LONG_HOURS"
  | "DUPLICATE"
  | "INVALID"
  | "NO_BREAK"
  | "OVERLAPPING";

export type WarningSeverity = "info" | "warning" | "error";

export interface ImportWarning {
  type: WarningType;
  date: string;
  message: string;
  severity: WarningSeverity;
  details?: string;
}

export interface EntryComparison {
  date: string;
  existing?: TimeEntry[];
  new: TimingEntry[];
  action: "CREATE" | "REPLACE" | "SKIP";
  conflicts: string[];
  totalHoursBefore?: number;
  totalHoursAfter: number;
}

export interface ImportPreviewSummary {
  totalEntries: number;
  newEntries: number;
  replacedEntries: number;
  affectedDays: number;
  totalHours: number;
  averageHoursPerDay: number;
  dateRange: {
    from: string;
    to: string;
  };
  entryTypeBreakdown: Record<EntryType, number>;
}

export interface ImportValidation {
  isValid: boolean;
  errors: string[];
  hasWarnings: boolean;
  hasCriticalErrors: boolean;
}

export interface DetailedImportPreview {
  previewId: string;
  summary: ImportPreviewSummary;
  warnings: ImportWarning[];
  entries: EntryComparison[];
  validation: ImportValidation;
  metadata?: {
    fileName: string;
    fileHash: string;
    analyzedAt: string;
  };
}

export class ImportPreviewService {
  /**
   * Generate a detailed preview of the import
   */
  async generateDetailedPreview(
    timingData: TimingExport,
    existingEntries: TimeEntry[],
    options?: {
      fileName?: string;
      fileHash?: string;
    },
  ): Promise<DetailedImportPreview> {
    const entries = Array.isArray(timingData) ? timingData : timingData.entries;

    // Generate preview ID
    const previewId = this.generatePreviewId();

    // Group entries by date
    const entriesByDate = this.groupEntriesByDate(entries);
    const existingByDate = this.groupExistingByDate(existingEntries);

    // Analyze each date
    const entryComparisons: EntryComparison[] = [];
    const warnings: ImportWarning[] = [];
    const validationErrors: string[] = [];

    let totalNewEntries = 0;
    let totalReplacedEntries = 0;
    let totalHours = 0;
    const entryTypeBreakdown: Record<EntryType, number> = {
      WORK: 0,
      OVERTIME: 0,
      VACATION: 0,
      SICK: 0,
      HOLIDAY: 0,
    };

    // Process each date
    const sortedDates = Array.from(entriesByDate.keys()).sort();

    for (const dateStr of sortedDates) {
      const dateEntries = entriesByDate.get(dateStr) || [];
      const existing = existingByDate.get(dateStr) || [];

      // Calculate hours
      const hoursBefore = existing.reduce(
        (sum, e) => sum + Number(e.duration),
        0,
      );
      const hoursAfter = dateEntries.reduce(
        (sum, e) => sum + parseDurationToHours(e.duration),
        0,
      );
      totalHours += hoursAfter;

      // Determine action
      let action: EntryComparison["action"] = "CREATE";
      if (existing.length > 0) {
        action = "REPLACE";
        totalReplacedEntries += existing.length;
      } else {
        totalNewEntries += dateEntries.length;
      }

      // Count entry types
      dateEntries.forEach((entry) => {
        const type = detectEntryType(entry.project);
        entryTypeBreakdown[type]++;
      });

      // Generate warnings for this date
      const dateWarnings = this.generateDateWarnings(
        dateStr,
        dateEntries,
        hoursAfter,
      );
      warnings.push(...dateWarnings);

      // Check for conflicts
      const conflicts = this.detectConflicts(dateEntries);
      if (conflicts.length > 0) {
        validationErrors.push(`${dateStr}: ${conflicts.join(", ")}`);
      }

      // Add comparison
      entryComparisons.push({
        date: dateStr,
        existing: existing.length > 0 ? existing : undefined,
        new: dateEntries,
        action,
        conflicts,
        totalHoursBefore: existing.length > 0 ? hoursBefore : undefined,
        totalHoursAfter: hoursAfter,
      });
    }

    // Calculate date range
    const dateRange = {
      from: sortedDates[0] || "",
      to: sortedDates[sortedDates.length - 1] || "",
    };

    // Build summary
    const summary: ImportPreviewSummary = {
      totalEntries: entries.length,
      newEntries: totalNewEntries,
      replacedEntries: totalReplacedEntries,
      affectedDays: sortedDates.length,
      totalHours: Number(totalHours.toFixed(2)),
      averageHoursPerDay: Number((totalHours / sortedDates.length).toFixed(2)),
      dateRange,
      entryTypeBreakdown,
    };

    // Build validation
    const validation: ImportValidation = {
      isValid: validationErrors.length === 0,
      errors: validationErrors,
      hasWarnings: warnings.length > 0,
      hasCriticalErrors: warnings.some((w) => w.severity === "error"),
    };

    return {
      previewId,
      summary,
      warnings,
      entries: entryComparisons,
      validation,
      metadata: options
        ? {
            fileName: options.fileName || "",
            fileHash: options.fileHash || "",
            analyzedAt: new Date().toISOString(),
          }
        : undefined,
    };
  }

  /**
   * Generate warnings for a specific date
   */
  private generateDateWarnings(
    dateStr: string,
    entries: TimingEntry[],
    totalHours: number,
  ): ImportWarning[] {
    const warnings: ImportWarning[] = [];
    const date = parseISO(dateStr);
    const formattedDate = format(date, "dd.MM.yyyy", { locale: de });

    // Check weekend work
    if (isWeekend(date)) {
      const dayName = format(date, "EEEE", { locale: de });
      warnings.push({
        type: "WEEKEND",
        date: dateStr,
        message: `Arbeit am ${dayName} (${formattedDate})`,
        severity: "info",
        details: `${entries.length} Einträge am Wochenende`,
      });
    }

    // Check long hours
    if (totalHours > 10) {
      warnings.push({
        type: "LONG_HOURS",
        date: dateStr,
        message: `Lange Arbeitszeit am ${formattedDate}`,
        severity: "warning",
        details: `${totalHours.toFixed(2)} Stunden (mehr als 10 Stunden)`,
      });

      // Check for missing break on long days
      if (totalHours > 6) {
        const hasBreak = this.checkForBreak(entries);
        if (!hasBreak) {
          warnings.push({
            type: "NO_BREAK",
            date: dateStr,
            message: `Keine Pause bei ${totalHours.toFixed(2)} Stunden Arbeit`,
            severity: "warning",
            details:
              "Bei mehr als 6 Stunden Arbeit ist eine Pause erforderlich",
          });
        }
      }
    }

    // Check for overlapping times
    const overlaps = this.findOverlaps(entries);
    if (overlaps.length > 0) {
      warnings.push({
        type: "OVERLAPPING",
        date: dateStr,
        message: `Überlappende Zeiteinträge am ${formattedDate}`,
        severity: "error",
        details: overlaps.join("; "),
      });
    }

    return warnings;
  }

  /**
   * Check if entries contain a break
   */
  private checkForBreak(entries: TimingEntry[]): boolean {
    if (entries.length <= 1) return false;

    // Sort entries by start time
    const sorted = [...entries].sort((a, b) =>
      a.startDate.localeCompare(b.startDate),
    );

    // Check gaps between entries
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = parseISO(sorted[i - 1].endDate);
      const nextStart = parseISO(sorted[i].startDate);
      const gapMinutes =
        (nextStart.getTime() - prevEnd.getTime()) / (1000 * 60);

      // Consider a gap of at least 30 minutes as a break
      if (gapMinutes >= 30) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find overlapping time entries
   */
  private findOverlaps(entries: TimingEntry[]): string[] {
    const overlaps: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const start1 = parseISO(entries[i].startDate);
        const end1 = parseISO(entries[i].endDate);
        const start2 = parseISO(entries[j].startDate);
        const end2 = parseISO(entries[j].endDate);

        // Check if times overlap
        if (start1 < end2 && start2 < end1) {
          const time1 = `${format(start1, "HH:mm")}-${format(end1, "HH:mm")}`;
          const time2 = `${format(start2, "HH:mm")}-${format(end2, "HH:mm")}`;
          overlaps.push(`${time1} überlappt mit ${time2}`);
        }
      }
    }

    return overlaps;
  }

  /**
   * Detect conflicts in entries
   */
  private detectConflicts(entries: TimingEntry[]): string[] {
    const conflicts: string[] = [];

    // Check for negative durations
    entries.forEach((entry) => {
      const start = parseISO(entry.startDate);
      const end = parseISO(entry.endDate);
      if (end < start) {
        conflicts.push("Endzeit vor Startzeit");
      }
    });

    // Check for duplicates
    const seen = new Set<string>();
    entries.forEach((entry) => {
      const key = `${entry.startDate}-${entry.endDate}`;
      if (seen.has(key)) {
        conflicts.push("Doppelte Einträge");
      }
      seen.add(key);
    });

    return conflicts;
  }

  /**
   * Group entries by date
   */
  private groupEntriesByDate(
    entries: TimingEntry[],
  ): Map<string, TimingEntry[]> {
    const grouped = new Map<string, TimingEntry[]>();

    entries.forEach((entry) => {
      const dateStr = entry.startDate.split("T")[0];
      if (!grouped.has(dateStr)) {
        grouped.set(dateStr, []);
      }
      grouped.get(dateStr)?.push(entry);
    });

    return grouped;
  }

  /**
   * Group existing entries by date
   */
  private groupExistingByDate(entries: TimeEntry[]): Map<string, TimeEntry[]> {
    const grouped = new Map<string, TimeEntry[]>();

    entries.forEach((entry) => {
      const dateStr = entry.date.toISOString().split("T")[0];
      if (!grouped.has(dateStr)) {
        grouped.set(dateStr, []);
      }
      grouped.get(dateStr)?.push(entry);
    });

    return grouped;
  }

  /**
   * Generate a unique preview ID
   */
  private generatePreviewId(): string {
    return `preview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
