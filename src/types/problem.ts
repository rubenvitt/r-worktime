export interface ProblemDay {
  date: Date;
  type: "missing" | "zero_hours" | "incomplete";
  currentHours: number;
  expectedHours: number;
  entries: TimeEntry[];
  isWeekend: boolean;
  isHoliday: boolean;
  suggestion: "review" | "add_entry" | "bulk_fill";
}

export interface ProblemStats {
  totalProblems: number;
  missingDays: number;
  zeroHoursDays: number;
  incompleteDays: number;
}

export interface ReviewedDay {
  id: string;
  userId: string;
  date: Date;
  reason?: string;
  reviewedAt: Date;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface TimeEntry {
  id: string;
  userId: string;
  date: Date;
  startTime?: Date;
  endTime?: Date;
  duration: number;
  type: "WORK" | "VACATION" | "SICK" | "HOLIDAY";
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProblemFilters {
  dateRange?: DateRange;
  problemType?: "missing" | "zero_hours" | "incomplete" | "all";
  reviewStatus?: "reviewed" | "unreviewed" | "all";
  sortBy?: "date_asc" | "date_desc" | "type";
}
