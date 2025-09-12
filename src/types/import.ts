import type { EntryType, TimeEntry } from "@prisma/client";
import type { TimingEntry } from "@/lib/schemas/timing-import";

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

export interface ImportResult {
  importLogId: string;
  processedEntries: number;
  createdEntries: number;
  replacedEntries: number;
  skippedEntries: number;
  errors: string[];
}

export interface UploadResponse {
  status: "preview" | "success" | "error";
  message: string;
  preview?: DetailedImportPreview;
  result?: ImportResult;
  isDuplicate?: boolean;
  requiresConfirmation?: boolean;
  error?: string;
}
