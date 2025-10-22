import { z } from "zod";

// Schema für einen einzelnen Timing Export Eintrag
export const timingEntrySchema = z.object({
  id: z.string().optional(),
  startDate: z.string(), // ISO 8601 format with timezone
  endDate: z.string(),
  duration: z.string(), // Format: "H:MM:SS" or "MM:SS"
  project: z.string(), // Path with ▸ separators
  activityTitle: z.string(),
  activityType: z.string().optional(),
  billingStatus: z.string().optional(),
  notes: z.string().optional(),
  isRunning: z.boolean().optional(),
});

// Schema für das komplette Timing Export JSON
// Timing exports can be either an array directly or wrapped in an object
export const timingExportSchema = z.union([
  z.array(timingEntrySchema), // Direct array format
  z.object({
    dateRange: z
      .object({
        from: z.string(),
        to: z.string(),
      })
      .optional(),
    entries: z.array(timingEntrySchema),
    version: z.string().optional(),
    exportedAt: z.string().optional(),
  }),
]);

// Type exports
export type TimingEntry = z.infer<typeof timingEntrySchema>;
export type TimingExport = z.infer<typeof timingExportSchema>;

// Helper function to detect entry type based on project path
export function detectEntryType(
  projectPath: string,
): "WORK" | "VACATION" | "SICK" | "HOLIDAY" {
  const pathString = projectPath.toLowerCase();

  if (
    pathString.includes("krankheit") ||
    pathString.includes("krank") ||
    pathString.includes("sick")
  ) {
    return "SICK";
  }
  if (
    pathString.includes("urlaub") ||
    pathString.includes("vacation") ||
    pathString.includes("ferien")
  ) {
    return "VACATION";
  }
  if (pathString.includes("feiertag") || pathString.includes("holiday")) {
    return "HOLIDAY";
  }

  return "WORK";
}

// Helper to parse duration string (H:MM:SS or MM:SS) to hours
export function parseDurationToHours(durationString: string): number {
  const parts = durationString.split(":").map((p) => parseInt(p, 10));

  if (parts.length === 3) {
    // H:MM:SS format
    const [hours, minutes, seconds] = parts;
    return Number((hours + minutes / 60 + seconds / 3600).toFixed(2));
  } else if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return Number((minutes / 60 + seconds / 3600).toFixed(2));
  }

  throw new Error(`Invalid duration format: ${durationString}`);
}

// Helper to split project path
export function parseProjectPath(projectString: string): string[] {
  return projectString.split(" ▸ ").map((s) => s.trim());
}
