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
        weeklyWorkHours: new Prisma.Decimal(
          DEFAULT_SETTINGS.weeklyWorkHours ?? 40,
        ),
        workDays: DEFAULT_SETTINGS.workDays ?? [1, 2, 3, 4, 5],
        defaultStartTime: DEFAULT_SETTINGS.defaultStartTime ?? "09:00",
        defaultEndTime: DEFAULT_SETTINGS.defaultEndTime ?? "17:00",
        breakDuration: new Prisma.Decimal(
          DEFAULT_SETTINGS.breakDuration ?? 0.5,
        ),
        timezone: DEFAULT_SETTINGS.timezone ?? "Europe/Berlin",
        overtimeNotification: DEFAULT_SETTINGS.overtimeNotification ?? true,
        language: DEFAULT_SETTINGS.language ?? "de",
        theme: DEFAULT_SETTINGS.theme ?? "system",
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
    defaultStartTime: string;
    defaultEndTime: string;
    breakDuration: Prisma.Decimal;
    timezone: string;
    overtimeNotification: boolean;
    language: string;
    theme: string;
    updatedAt: Date;
  }> = {};

  if (data.weeklyWorkHours !== undefined) {
    updateData.weeklyWorkHours = new Prisma.Decimal(data.weeklyWorkHours);
  }
  if (data.workDays !== undefined) {
    updateData.workDays = data.workDays;
  }
  if (data.defaultStartTime !== undefined) {
    updateData.defaultStartTime = data.defaultStartTime;
  }
  if (data.defaultEndTime !== undefined) {
    updateData.defaultEndTime = data.defaultEndTime;
  }
  if (data.breakDuration !== undefined) {
    updateData.breakDuration = new Prisma.Decimal(data.breakDuration);
  }
  if (data.timezone !== undefined) {
    updateData.timezone = data.timezone;
  }
  if (data.overtimeNotification !== undefined) {
    updateData.overtimeNotification = data.overtimeNotification;
  }
  if (data.language !== undefined) {
    updateData.language = data.language;
  }
  if (data.theme !== undefined) {
    updateData.theme = data.theme;
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
      weeklyWorkHours: new Prisma.Decimal(
        DEFAULT_SETTINGS.weeklyWorkHours ?? 40,
      ),
      workDays: DEFAULT_SETTINGS.workDays ?? [1, 2, 3, 4, 5],
      defaultStartTime: DEFAULT_SETTINGS.defaultStartTime ?? "09:00",
      defaultEndTime: DEFAULT_SETTINGS.defaultEndTime ?? "17:00",
      breakDuration: new Prisma.Decimal(DEFAULT_SETTINGS.breakDuration ?? 0.5),
      timezone: DEFAULT_SETTINGS.timezone ?? "Europe/Berlin",
      overtimeNotification: DEFAULT_SETTINGS.overtimeNotification ?? true,
      language: DEFAULT_SETTINGS.language ?? "de",
      theme: DEFAULT_SETTINGS.theme ?? "system",
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
 * Calculate if overtime notification should be triggered
 */
export function shouldNotifyOvertime(
  settings: UserSettingsResponse,
  actualHours: number,
  date: Date,
): boolean {
  if (!settings.overtimeNotification) return false;

  const expectedHours = calculateExpectedHours(settings, date);
  return actualHours > expectedHours;
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
  defaultStartTime: string;
  defaultEndTime: string;
  breakDuration: Prisma.Decimal;
  timezone: string;
  overtimeNotification: boolean;
  language: string;
  theme: string;
  createdAt: Date;
  updatedAt: Date;
}): UserSettingsResponse {
  return {
    id: settings.id,
    userId: settings.userId,
    weeklyWorkHours: Number(settings.weeklyWorkHours),
    workDays: settings.workDays,
    defaultStartTime: settings.defaultStartTime,
    defaultEndTime: settings.defaultEndTime,
    breakDuration: Number(settings.breakDuration),
    timezone: settings.timezone,
    overtimeNotification: settings.overtimeNotification,
    language: settings.language,
    theme: settings.theme,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}
