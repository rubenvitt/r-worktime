import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SETTINGS,
  type UserSettingsResponse,
  type UserSettingsUpdate,
} from "@/types/settings";

export class SettingsService {
  /**
   * Get user settings or create default ones if they don't exist
   */
  static async getUserSettings(userId: string): Promise<UserSettingsResponse> {
    let settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // Create default settings if they don't exist
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId,
          weeklyWorkHours: new Prisma.Decimal(
            DEFAULT_SETTINGS.weeklyWorkHours!,
          ),
          workDays: DEFAULT_SETTINGS.workDays!,
          defaultStartTime: DEFAULT_SETTINGS.defaultStartTime!,
          defaultEndTime: DEFAULT_SETTINGS.defaultEndTime!,
          breakDuration: new Prisma.Decimal(DEFAULT_SETTINGS.breakDuration!),
          timezone: DEFAULT_SETTINGS.timezone!,
          overtimeNotification: DEFAULT_SETTINGS.overtimeNotification!,
          language: DEFAULT_SETTINGS.language!,
          theme: DEFAULT_SETTINGS.theme!,
        },
      });
    }

    return SettingsService.formatSettingsResponse(settings);
  }

  /**
   * Update user settings
   */
  static async updateUserSettings(
    userId: string,
    data: UserSettingsUpdate,
  ): Promise<UserSettingsResponse> {
    // Ensure settings exist first
    await SettingsService.getUserSettings(userId);

    const updatedSettings = await prisma.userSettings.update({
      where: { userId },
      data: {
        weeklyWorkHours: new Prisma.Decimal(data.weeklyWorkHours),
        workDays: data.workDays,
        defaultStartTime: data.defaultStartTime,
        defaultEndTime: data.defaultEndTime,
        breakDuration: new Prisma.Decimal(data.breakDuration),
        timezone: data.timezone,
        overtimeNotification: data.overtimeNotification,
        language: data.language,
        theme: data.theme,
        updatedAt: new Date(),
      },
    });

    // Invalidate any cached calculations
    await SettingsService.invalidateUserCache(userId);

    return SettingsService.formatSettingsResponse(updatedSettings);
  }

  /**
   * Reset user settings to defaults
   */
  static async resetUserSettings(
    userId: string,
  ): Promise<UserSettingsResponse> {
    const resetSettings = await prisma.userSettings.update({
      where: { userId },
      data: {
        weeklyWorkHours: new Prisma.Decimal(DEFAULT_SETTINGS.weeklyWorkHours!),
        workDays: DEFAULT_SETTINGS.workDays!,
        defaultStartTime: DEFAULT_SETTINGS.defaultStartTime!,
        defaultEndTime: DEFAULT_SETTINGS.defaultEndTime!,
        breakDuration: new Prisma.Decimal(DEFAULT_SETTINGS.breakDuration!),
        timezone: DEFAULT_SETTINGS.timezone!,
        overtimeNotification: DEFAULT_SETTINGS.overtimeNotification!,
        language: DEFAULT_SETTINGS.language!,
        theme: DEFAULT_SETTINGS.theme!,
        updatedAt: new Date(),
      },
    });

    await SettingsService.invalidateUserCache(userId);
    return SettingsService.formatSettingsResponse(resetSettings);
  }

  /**
   * Calculate daily work hours based on settings
   */
  static calculateDailyWorkHours(settings: UserSettingsResponse): number {
    const workDaysPerWeek = settings.workDays.length;
    if (workDaysPerWeek === 0) return 0;

    return settings.weeklyWorkHours / workDaysPerWeek;
  }

  /**
   * Calculate expected work hours for a specific date
   */
  static calculateExpectedHours(
    settings: UserSettingsResponse,
    date: Date,
  ): number {
    const dayOfWeek = date.getDay();

    // Check if this is a work day
    if (!settings.workDays.includes(dayOfWeek)) {
      return 0;
    }

    // Calculate daily hours including break
    const dailyHours = SettingsService.calculateDailyWorkHours(settings);
    return dailyHours;
  }

  /**
   * Check if a specific date is a work day
   */
  static isWorkDay(settings: UserSettingsResponse, date: Date): boolean {
    const dayOfWeek = date.getDay();
    return settings.workDays.includes(dayOfWeek);
  }

  /**
   * Format settings response with proper type conversions
   */
  private static formatSettingsResponse(settings: any): UserSettingsResponse {
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

  /**
   * Invalidate cached calculations for a user
   * This will be important when integrating with overtime calculations
   */
  private static async invalidateUserCache(userId: string): Promise<void> {
    // TODO: Implement cache invalidation when cache is set up
    // For now, this is a placeholder for future implementation
    console.log(`Cache invalidated for user: ${userId}`);
  }

  /**
   * Get work days for the current week
   */
  static getWorkDaysForWeek(
    settings: UserSettingsResponse,
    weekStart: Date,
  ): Date[] {
    const workDays: Date[] = [];

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(weekStart);
      currentDate.setDate(weekStart.getDate() + i);

      if (SettingsService.isWorkDay(settings, currentDate)) {
        workDays.push(currentDate);
      }
    }

    return workDays;
  }

  /**
   * Calculate overtime threshold for a period
   */
  static calculateOvertimeThreshold(
    settings: UserSettingsResponse,
    startDate: Date,
    endDate: Date,
  ): number {
    let totalExpectedHours = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
      totalExpectedHours += SettingsService.calculateExpectedHours(
        settings,
        current,
      );
      current.setDate(current.getDate() + 1);
    }

    return totalExpectedHours;
  }
}
