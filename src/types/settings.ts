import { z } from "zod";

// Validation schema for user settings
export const userSettingsSchema = z.object({
  weeklyWorkHours: z
    .number()
    .min(1, "Wöchentliche Arbeitszeit muss mindestens 1 Stunde betragen")
    .max(
      168,
      "Wöchentliche Arbeitszeit kann nicht mehr als 168 Stunden betragen",
    ),

  workDays: z
    .array(z.number().min(0).max(6))
    .min(1, "Mindestens ein Arbeitstag muss ausgewählt sein")
    .max(7, "Maximal 7 Arbeitstage möglich")
    .refine(
      (days) => new Set(days).size === days.length,
      "Arbeitstage dürfen nicht doppelt vorkommen",
    ),

  defaultStartTime: z
    .string()
    .regex(
      /^([01]\d|2[0-3]):([0-5]\d)$/,
      "Startzeit muss im Format HH:mm sein",
    ),

  defaultEndTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Endzeit muss im Format HH:mm sein"),

  breakDuration: z
    .number()
    .min(0, "Pausendauer kann nicht negativ sein")
    .max(8, "Pausendauer kann nicht mehr als 8 Stunden betragen"),

  timezone: z
    .string()
    .min(1, "Zeitzone ist erforderlich")
    .refine((tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Ungültige Zeitzone"),

  overtimeNotification: z.boolean().optional(),
  language: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
});

// Refine to ensure start time is before end time
export const userSettingsUpdateSchema = userSettingsSchema.refine(
  (data) => {
    const start = data.defaultStartTime.split(":").map(Number);
    const end = data.defaultEndTime.split(":").map(Number);
    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];
    return startMinutes < endMinutes;
  },
  {
    message: "Startzeit muss vor der Endzeit liegen",
    path: ["defaultEndTime"],
  },
);

// Type inference
export type UserSettings = z.infer<typeof userSettingsSchema>;
export type UserSettingsUpdate = z.infer<typeof userSettingsUpdateSchema>;

// Response types
export interface UserSettingsResponse {
  id: string;
  userId: string;
  weeklyWorkHours: number;
  workDays: number[];
  defaultStartTime: string;
  defaultEndTime: string;
  breakDuration: number;
  timezone: string;
  overtimeNotification: boolean;
  language: string;
  theme: string;
  createdAt: Date;
  updatedAt: Date;
}

// API response types
export interface SettingsApiResponse {
  success: boolean;
  data?: UserSettingsResponse;
  error?: string;
}

// Constants for work days
export const WORK_DAYS = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;

export const WORK_DAY_LABELS = {
  [WORK_DAYS.SUNDAY]: "Sonntag",
  [WORK_DAYS.MONDAY]: "Montag",
  [WORK_DAYS.TUESDAY]: "Dienstag",
  [WORK_DAYS.WEDNESDAY]: "Mittwoch",
  [WORK_DAYS.THURSDAY]: "Donnerstag",
  [WORK_DAYS.FRIDAY]: "Freitag",
  [WORK_DAYS.SATURDAY]: "Samstag",
} as const;

// Default settings
export const DEFAULT_SETTINGS: Partial<UserSettings> = {
  weeklyWorkHours: 40,
  workDays: [1, 2, 3, 4, 5], // Mo-Fr
  defaultStartTime: "09:00",
  defaultEndTime: "17:00",
  breakDuration: 0.5,
  timezone: "Europe/Berlin",
  overtimeNotification: true,
  language: "de",
  theme: "system",
};
