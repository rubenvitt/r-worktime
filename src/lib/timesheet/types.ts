import type {
  Rounding,
  TimesheetActivity,
  TimesheetDay,
  TimesheetEntry,
} from "./aggregate";

export interface TimesheetActivityView extends TimesheetActivity {
  /** gerundete Dauer "H:MM" */
  hours: string;
}

export interface TimesheetDayView extends Omit<TimesheetDay, "activities"> {
  activities: TimesheetActivityView[];
  /** gerundete Tagessumme "H:MM" */
  hours: string;
  /** Tagestext wie im Payload */
  text: string;
}

export interface TimesheetResponse {
  month: string;
  root: string | null;
  rounding: Rounding;
  includeAbsences: boolean;
  days: TimesheetDayView[];
  /** Vertrag für Clipboard/Extension (travelFee = Vorschlag) */
  payload: TimesheetEntry[];
  totals: {
    /** Summe der ungerundeten Minuten */
    minutes: number;
    /** Summe der gerundeten Tage in Minuten */
    roundedMinutes: number;
    /** Summe der gerundeten Tage "H:MM" */
    hours: string;
    days: number;
    entries: number;
  };
  /** alle Projekt-Präfixe des Users */
  availableRoots: string[];
}
