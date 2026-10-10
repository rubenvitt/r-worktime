import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SETTINGS,
  type UserSettingsResponse,
  type UserSettingsUpdate,
} from "@/types/settings";

/**
 * Get user settings or create default ones if they don't exist
 */
export async function getUserSettings(
  userId: string,
): Promise<UserSettingsResponse> {
  let settings = await prisma.userSettings.findUnique({
    where: { userId },
  });

  // Create default settings if they don't exist
  if (!settings) {
    settings = await prisma.userSettings.create({
      data: {
        userId,
        weeklyWorkHours: new Prisma.Decimal(DEFAULT_SETTINGS.weeklyWorkHours),
        workDays: DEFAULT_SETTINGS.workDays,
        annualVacationDays: new Prisma.Decimal(
          DEFAULT_SETTINGS.annualVacationDays,
        ),
      },
    });
  }

  return formatSettingsResponse(settings);
}

/**
 * Update user settings
 */
export async function updateUserSettings(
  userId: string,
  data: UserSettingsUpdate,
): Promise<UserSettingsResponse> {
  // Ensure settings exist first
  await getUserSettings(userId);

  const updateData: Partial<{
    weeklyWorkHours: Prisma.Decimal;
    workDays: number[];
    annualVacationDays: Prisma.Decimal;
    updatedAt: Date;
  }> = {};

  if (data.weeklyWorkHours !== undefined) {
    updateData.weeklyWorkHours = new Prisma.Decimal(data.weeklyWorkHours);
  }
  if (data.workDays !== undefined) {
    updateData.workDays = data.workDays;
  }
  if (data.annualVacationDays !== undefined) {
    updateData.annualVacationDays = new Prisma.Decimal(data.annualVacationDays);
  }

  updateData.updatedAt = new Date();

  const settings = await prisma.userSettings.update({
    where: { userId },
    data: updateData,
  });

  return formatSettingsResponse(settings);
}

/**
 * Reset user settings to defaults
 */
export async function resetUserSettings(
  userId: string,
): Promise<UserSettingsResponse> {
  const resetSettings = await prisma.userSettings.update({
    where: { userId },
    data: {
      weeklyWorkHours: new Prisma.Decimal(DEFAULT_SETTINGS.weeklyWorkHours),
      workDays: DEFAULT_SETTINGS.workDays,
      annualVacationDays: new Prisma.Decimal(
        DEFAULT_SETTINGS.annualVacationDays,
      ),
      updatedAt: new Date(),
    },
  });

  return formatSettingsResponse(resetSettings);
}

/**
 * Calculate daily work hours based on settings
 */
export function calculateDailyWorkHours(
  settings: UserSettingsResponse,
): number {
  const workDaysPerWeek = settings.workDays.length;
  if (workDaysPerWeek === 0) return 0;

  return settings.weeklyWorkHours / workDaysPerWeek;
}

/**
 * Calculate expected work hours for a specific date
 */
export function calculateExpectedHours(
  settings: UserSettingsResponse,
  date: Date,
): number {
  const dayOfWeek = date.getDay();

  // Check if this is a work day
  if (!settings.workDays.includes(dayOfWeek)) {
    return 0;
  }

  return calculateDailyWorkHours(settings);
}

/**
 * Calculate total expected hours for a given date range
 */
export function calculateTotalExpectedHours(
  settings: UserSettingsResponse,
  startDate: Date,
  endDate: Date,
): number {
  let totalExpectedHours = 0;
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    totalExpectedHours += calculateExpectedHours(settings, currentDate);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return totalExpectedHours;
}

/**
 * Format settings response
 */
function formatSettingsResponse(settings: {
  id: string;
  userId: string;
  weeklyWorkHours: Prisma.Decimal;
  workDays: number[];
  annualVacationDays: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}): UserSettingsResponse {
  return {
    id: settings.id,
    userId: settings.userId,
    weeklyWorkHours: Number(settings.weeklyWorkHours),
    workDays: settings.workDays,
    annualVacationDays: Number(settings.annualVacationDays),
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}
