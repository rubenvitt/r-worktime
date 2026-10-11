import type { Prisma } from "@prisma/client";

export enum EntryType {
  WORK = "WORK",
  OVERTIME = "OVERTIME",
  VACATION = "VACATION",
  SICK = "SICK",
  HOLIDAY = "HOLIDAY",
  OVERTIME_REDUCTION = "OVERTIME_REDUCTION",
  UNPAID_LEAVE = "UNPAID_LEAVE",
}

export enum EntrySource {
  MANUAL = "MANUAL",
  FILE_IMPORT = "FILE_IMPORT",
  TIMING_SYNC = "TIMING_SYNC",
  BULK_FILL = "BULK_FILL",
  HOLIDAY = "HOLIDAY",
  ADJUSTMENT = "ADJUSTMENT",
  TIMEWARP = "TIMEWARP",
}

export interface TimeEntry {
  id: string;
  userId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  duration: Prisma.Decimal; // In Stunden
  type: EntryType;
  description?: string | null;
  title?: string | null;
  notes?: string | null;
  projectPath?: string | null;
  externalId?: string | null;
  source: EntrySource;
  billingStatus?: string | null;
  importLogId?: string | null;
  absenceId?: string | null;
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
  weeklyWorkHours: Prisma.Decimal; // Standard Arbeitsstunden pro Woche
  workDays: number[];
  annualVacationDays: Prisma.Decimal; // Jahresurlaubsanspruch in Tagen
  createdAt: Date;
  updatedAt: Date;
}
