import { weekdayOfKey } from "@/lib/dates";

export interface Holiday {
  date: string;
  fname: string;
  all_states?: string;
  ni?: string;
  [key: string]: string | undefined;
}

export interface HolidayApiResponse {
  status: string;
  feiertage: Holiday[];
}

export class HolidayService {
  private readonly API_BASE_URL = "https://get.api-feiertage.de";
  private readonly STATE = "ni"; // Niedersachsen

  /**
   * Fetch holidays for a specific year from the API
   */
  async fetchHolidaysForYear(year: number): Promise<Holiday[]> {
    try {
      const url = `${this.API_BASE_URL}?years=${year}&states=${this.STATE}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch holidays: ${response.statusText}`);
      }

      const data: HolidayApiResponse = await response.json();

      // Check if response is successful
      if (data.status !== "success" || !data.feiertage) {
        return [];
      }

      // Filter holidays - only include those valid in Niedersachsen (ni) and on weekdays
      const filteredHolidays: Holiday[] = [];

      for (const holiday of data.feiertage) {
        // Check if holiday is valid in Niedersachsen
        if (holiday.ni !== "1" && holiday.all_states !== "1") {
          continue;
        }

        // Only include weekdays (Monday to Friday); reiner Kalendertag,
        // unabhängig von der Zeitzone des Servers
        const weekday = weekdayOfKey(holiday.date);
        if (weekday !== 0 && weekday !== 6) {
          filteredHolidays.push(holiday);
        }
      }

      return filteredHolidays.sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      console.error(`Error fetching holidays for year ${year}:`, error);
      throw error;
    }
  }

  /**
   * Calculate daily work hours based on weekly hours
   */
  calculateDailyWorkHours(weeklyWorkHours: number): number {
    // Assume 5 working days per week
    return weeklyWorkHours / 5;
  }

  /**
   * Generate standard work times for holidays
   */
  generateWorkTimes(
    date: Date,
    dailyHours: number,
  ): { startTime: Date; endTime: Date } {
    // Standard start time: 9:00 AM
    const startTime = new Date(date);
    startTime.setHours(9, 0, 0, 0);

    // Calculate end time based on daily hours
    const endTime = new Date(startTime);
    const hours = Math.floor(dailyHours);
    const minutes = Math.round((dailyHours - hours) * 60);
    endTime.setHours(9 + hours, minutes, 0, 0);

    return { startTime, endTime };
  }
}
