import type { EntryType } from "./database";

export interface OvertimeBalance {
  userId: string;
  balance: number; // In Stunden
  period?: {
    startDate: Date;
    endDate: Date;
  };
  details?: {
    actualHours: number;
    targetHours: number;
    overtimeHours: number;
  };
  lastUpdated: Date;
}

export interface WeeklyStatistics {
  userId: string;
  year: number;
  week: number;
  totalHours: number;
  targetHours: number;
  overtimeHours: number;
  dailyBreakdown: DailyStatistics[];
  entryTypes: {
    work: number;
    vacation: number;
    sick: number;
    holiday: number;
  };
}

export interface DailyStatistics {
  date: Date;
  actualHours: number;
  targetHours: number;
  overtimeHours: number;
  entryType: EntryType;
}

export interface MonthlyStatistics {
  userId: string;
  year: number;
  month: number;
  totalHours: number;
  targetHours: number;
  overtimeHours: number;
  weeklyBreakdown: WeeklyStatistics[];
  billableHours: number;
  nonBillableHours: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface OvertimeCalculationParams {
  userId: string;
  startDate?: Date;
  endDate?: Date;
  includeDetails?: boolean;
}

export interface StatisticsApiResponse<T> {
  data: T;
  metadata?: {
    cached: boolean;
    cacheAge?: number;
    calculatedAt: Date;
  };
}
