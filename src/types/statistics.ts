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

// Week View Types
export interface WeekData {
  year: number;
  week: number;
  weekStartDate: Date;
  weekEndDate: Date;
  days: DayData[];
  summary: WeekSummary;
}

export interface DayData {
  date: Date;
  dayOfWeek: string;
  entries: TimeEntryData[];
  totalHours: number;
  targetHours: number;
  difference: number;
  isWeekend: boolean;
}

export interface TimeEntryData {
  id: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  type: EntryType;
  description: string | null;
}

export interface WeekSummary {
  totalWorkHours: number;
  targetHours: number;
  weekBalance: number;
  cumulativeBalance: number;
}

export interface WeekDataResponse {
  data: WeekData;
  metadata: {
    year: number;
    week: number;
    calculatedAt: Date;
  };
}
