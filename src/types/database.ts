import type { Decimal } from "@prisma/client/runtime/library";

export enum EntryType {
  WORK = "WORK",
  OVERTIME = "OVERTIME",
  VACATION = "VACATION",
  SICK = "SICK",
  HOLIDAY = "HOLIDAY",
}

export interface TimeEntry {
  id: string;
  userId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  duration: Decimal; // In Stunden
  type: EntryType;
  description?: string | null;
  importLogId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  password?: string;
  role: string;
  settings?: UserSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSettings {
  id: string;
  userId: string;
  weeklyWorkHours: Decimal; // Standard Arbeitsstunden pro Woche
  overtimeNotification: boolean;
  language: string;
  theme: string;
  createdAt: Date;
  updatedAt: Date;
}
