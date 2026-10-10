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
      // Keine Daten ist ein Fehler, kein „Jahr ohne Feiertage“ – sonst würde
      // das leere Ergebnis einen Tag lang gecacht
      if (data.status !== "success" || !data.feiertage) {
        throw new Error("Feiertags-Dienst lieferte keine Feiertage");
      }

      // Nur Feiertage in Niedersachsen. Alle Wochentage: ob ein Feiertag das
      // Soll mindert, entscheidet der Aufrufer anhand der Arbeitstage
      // (UserSettings.workDays) – auch Samstag oder Sonntag kann einer sein.
      const filteredHolidays = data.feiertage.filter(
        (holiday) => holiday.ni === "1" || holiday.all_states === "1",
      );

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

// ---------------------------------------------------------------------------
// Offizielle Feiertage mit Cache: eine Quelle für Saldo, Woche, Berichte,
// Problemerkennung und Auffüllung. Erfolgreiche Abrufe gelten einen Tag,
// Fehlschläge nur kurz – sonst wartet jede Seite erneut den Timeout ab.

const holidayService = new HolidayService();
const HOLIDAY_CACHE_TTL = 24 * 60 * 60 * 1000;
/** Fehlschläge kurz merken: sonst wartet jede Wochen-/Berichtsseite den Timeout ab */
const HOLIDAY_FAILURE_TTL = 5 * 60 * 1000;
const HOLIDAY_FETCH_TIMEOUT = 5_000;
const holidayCache = new Map<
  number,
  { fetchedAt: number; ttl: number; holidays: Promise<Map<string, string>> }
>();

async function officialHolidays(year: number): Promise<Map<string, string>> {
  const cached = holidayCache.get(year);
  if (cached && Date.now() - cached.fetchedAt < cached.ttl) {
    return cached.holidays;
  }
  // Ohne Timeout bliebe ein hängender Abruf 24 h im Cache und blockierte die Routen
  let timer: ReturnType<typeof setTimeout> | undefined;
  const holidays = Promise.race([
    holidayService.fetchHolidaysForYear(year),
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Feiertags-Dienst antwortet nicht")),
        HOLIDAY_FETCH_TIMEOUT,
      );
    }),
  ])
    .then((list) => new Map(list.map((h) => [h.date.slice(0, 10), h.fname])))
    .finally(() => clearTimeout(timer));
  holidayCache.set(year, {
    fetchedAt: Date.now(),
    ttl: HOLIDAY_CACHE_TTL,
    holidays,
  });
  try {
    return await holidays;
  } catch (error) {
    // Fehlschlag nur kurz cachen, danach erneut versuchen
    holidayCache.set(year, {
      fetchedAt: Date.now(),
      ttl: HOLIDAY_FAILURE_TTL,
      holidays,
    });
    throw error;
  }
}

// Zeiträume kommen teils aus Query-Parametern. Ohne Fenster löste ein
// Zeitraum über Jahrhunderte je Jahr einen Abruf beim Feiertags-Dienst aus.
const HOLIDAY_YEARS_BACK = 15;
const HOLIDAY_YEARS_AHEAD = 5;

/** Nur Jahre nahe dem aktuellen werden beim Feiertags-Dienst abgefragt */
export function isFetchableHolidayYear(
  year: number,
  now: Date = new Date(),
): boolean {
  const current = now.getUTCFullYear();
  return (
    Number.isInteger(year) &&
    year >= current - HOLIDAY_YEARS_BACK &&
    year <= current + HOLIDAY_YEARS_AHEAD
  );
}

export interface OfficialHolidayData {
  /** Datum → Name, alle offiziellen Feiertage (auch am Wochenende) */
  names: Record<string, string>;
  /** Jahre, für die der Feiertags-Dienst nicht erreichbar war */
  unavailableYears: number[];
}

/**
 * Offizielle Feiertage (Niedersachsen) – Fehler einzelner Jahre werden
 * gemeldet, nicht geworfen. Aufrufer fallen dann auf importierte
 * HOLIDAY-Einträge zurück.
 */
export async function loadOfficialHolidays(
  years: number[],
  now: Date = new Date(),
): Promise<OfficialHolidayData> {
  const sortedYears = [...new Set(years)].sort((a, b) => a - b);
  const results = await Promise.all(
    sortedYears.map((year) =>
      (isFetchableHolidayYear(year, now)
        ? officialHolidays(year)
        : Promise.reject(new Error("Jahr außerhalb des Abruffensters"))
      ).then(
        (map) => ({ year, map }),
        (error: unknown) => {
          console.error(`Feiertage ${year} nicht verfügbar:`, error);
          return { year, map: null };
        },
      ),
    ),
  );
  const names: Record<string, string> = {};
  const unavailableYears: number[] = [];
  for (const { year, map } of results) {
    if (!map) unavailableYears.push(year);
    else for (const [key, name] of map) names[key] = name;
  }
  return { names, unavailableYears };
}
