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

  annualVacationDays: z
    .number()
    .min(0, "Der Urlaubsanspruch kann nicht negativ sein")
    .max(60, "Der Urlaubsanspruch kann höchstens 60 Tage betragen")
    .refine(
      (days) => Number.isInteger(days * 2),
      "Nur ganze oder halbe Tage möglich",
    ),
});

// Eigener Name für Updates (Route und Formular importieren ihn)
export const userSettingsUpdateSchema = userSettingsSchema;

// Type inference
export type UserSettings = z.infer<typeof userSettingsSchema>;
export type UserSettingsUpdate = z.infer<typeof userSettingsUpdateSchema>;

// Response types
export interface UserSettingsResponse {
  id: string;
  userId: string;
  weeklyWorkHours: number;
  workDays: number[];
  annualVacationDays: number;
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
export const DEFAULT_SETTINGS: UserSettings = {
  weeklyWorkHours: 40,
  workDays: [1, 2, 3, 4, 5], // Mo-Fr
  annualVacationDays: 30,
};
