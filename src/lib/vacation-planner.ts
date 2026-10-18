// Urlaubsplaner: reine Rechnungen für Entwürfe, freie Tage am Stück und
// Brückentage. Gebucht wird in Timewarp; der Planer rechnet nur voraus.
//
// Regeln:
// - Ein Tag ist frei, wenn er kein Arbeitstag ist (UserSettings.workDays),
//   ein offizieller Feiertag ist oder ganz mit Abwesenheit belegt ist.
// - Ein Entwurf kostet je Arbeitstag ohne Feiertag einen Urlaubstag, abzüglich
//   schon gebuchter Abwesenheit an dem Tag (halber Tag gebucht → ½ Tag offen).
// - Heiligabend und Silvester (HALF_VACATION_DAYS) kosten an Arbeitstagen
//   nur einen halben Urlaubstag; mit ½ Tag gebucht sind sie frei.
// - Freie Tage am Stück: der Zeitraum, verlängert um angrenzende freie Tage.
// - Brückentage: höchstens MAX_BRIDGE_DAYS Arbeitstage zwischen zwei freien
//   Blöcken (auch über freie Tage hinweg), und im entstehenden freien Block
//   liegt ein Feiertag. Ohne diese Bedingung wäre jede normale Woche ein
//   Vorschlag. Vorschläge unter MIN_BRIDGE_EFFICIENCY fallen weg.

import { isDateKey, shiftDateKey, weekdayOfKey } from "@/lib/dates";

/** Längste Brücke, die noch als Vorschlag gilt (Arbeitstage) */
export const MAX_BRIDGE_DAYS = 4;
/** Vorschläge erst ab doppeltem Gewinn: freie Tage ÷ Urlaubstage */
export const MIN_BRIDGE_EFFICIENCY = 2;
/** Tage ("MM-TT"), an denen Urlaub nur einen halben Tag kostet */
export const HALF_VACATION_DAYS: readonly string[] = ["12-24", "12-31"];

/** Längster Entwurf in Kalendertagen */
export const MAX_DRAFT_DAYS = 62;

export interface BookedDay {
  dateKey: string;
  /** Belegter Anteil des Tags (½ oder 1) */
  share: number;
  /** Belastet das Urlaubskonto (Urlaub, Resturlaub) */
  countsAsVacation: boolean;
}

export interface PlannerContext {
  /** 0 = Sonntag … 6 = Samstag */
  workDays: ReadonlySet<number>;
  /** Offizielle Feiertage: Datum → Name */
  holidays: Readonly<Record<string, string>>;
  /** Gebuchte Abwesenheit je Tag (Timewarp, Dialog, Timing) */
  booked: ReadonlyMap<string, BookedDay>;
}

export interface DateSpan {
  /** "YYYY-MM-DD", inklusive */
  from: string;
  /** "YYYY-MM-DD", inklusive */
  to: string;
}

export function createPlannerContext(input: {
  workDays: readonly number[];
  holidays: Readonly<Record<string, string>>;
  booked: readonly BookedDay[];
}): PlannerContext {
  return {
    workDays: new Set(input.workDays),
    holidays: input.holidays,
    booked: new Map(input.booked.map((day) => [day.dateKey, day])),
  };
}

/** Alle Tage von `from` bis `to` (inklusive); leer, wenn `from` danach liegt. */
export function daysOf(span: DateSpan): string[] {
  const keys: string[] = [];
  for (let key = span.from; key <= span.to; key = shiftDateKey(key, 1)) {
    keys.push(key);
  }
  return keys;
}

/** Zahl der Kalendertage im Zeitraum */
export function spanLength(span: DateSpan): number {
  return daysOf(span).length;
}

/** Arbeitstag ohne Feiertag: hier würde Urlaub etwas kosten */
export function isPlannableDay(key: string, ctx: PlannerContext): boolean {
  return ctx.workDays.has(weekdayOfKey(key)) && !(key in ctx.holidays);
}

/** Heiligabend oder Silvester: Urlaub kostet dort ½ Tag */
export function isHalfVacationDay(key: string): boolean {
  return HALF_VACATION_DAYS.includes(key.slice(5));
}

/** Urlaubstage, die ein Tag kostet: 0, ½ oder 1 */
export function vacationDayCost(key: string, ctx: PlannerContext): number {
  if (!isPlannableDay(key, ctx)) return 0;
  return isHalfVacationDay(key) ? 0.5 : 1;
}

export function isFreeDay(key: string, ctx: PlannerContext): boolean {
  const cost = vacationDayCost(key, ctx);
  return cost === 0 || (ctx.booked.get(key)?.share ?? 0) >= cost;
}

export interface SpanCost {
  /** Arbeitstage ohne Feiertag im Zeitraum */
  workDays: number;
  /** Urlaubstage für den ganzen Zeitraum (24./31.12. zählen ½) */
  needed: number;
  /** davon schon gebucht */
  booked: number;
  /** noch zu nehmende Urlaubstage */
  open: number;
}

export function spanCost(span: DateSpan, ctx: PlannerContext): SpanCost {
  let workDays = 0;
  let needed = 0;
  let booked = 0;
  for (const key of daysOf(span)) {
    const cost = vacationDayCost(key, ctx);
    if (cost === 0) continue;
    workDays++;
    needed += cost;
    booked += Math.min(cost, ctx.booked.get(key)?.share ?? 0);
  }
  return { workDays, needed, booked, open: needed - booked };
}

/**
 * Zeitraum plus angrenzende freie Tage. Gilt der Zeitraum als genommen,
 * ist das der zusammenhängende freie Block.
 */
export function freeStretch(span: DateSpan, ctx: PlannerContext): DateSpan {
  let from = span.from;
  let to = span.to;
  // Begrenzt, damit eine Kette freier Tage (z. B. Sabbatical) nicht ewig läuft
  for (let i = 0; i < 366 && isFreeDay(shiftDateKey(from, -1), ctx); i++) {
    from = shiftDateKey(from, -1);
  }
  for (let i = 0; i < 366 && isFreeDay(shiftDateKey(to, 1), ctx); i++) {
    to = shiftDateKey(to, 1);
  }
  return { from, to };
}

export type DraftStatus = "open" | "partial" | "booked";

export interface DraftSummary extends SpanCost {
  status: DraftStatus;
  /** Freier Block, wenn der Entwurf so genommen wird */
  stretch: DateSpan;
  stretchDays: number;
}

/**
 * Stand eines Entwurfs. „Gebucht“ heißt: alle Arbeitstage sind schon als
 * Abwesenheit eingetragen (in der Regel über den Timewarp-Abgleich).
 */
export function summarizeDraft(
  span: DateSpan,
  ctx: PlannerContext,
): DraftSummary {
  const cost = spanCost(span, ctx);
  const status: DraftStatus =
    cost.workDays > 0 && cost.open <= 0
      ? "booked"
      : cost.booked > 0
        ? "partial"
        : "open";
  // Die Tage des Entwurfs gelten als frei
  const stretch = freeStretch(span, ctx);
  return { ...cost, status, stretch, stretchDays: spanLength(stretch) };
}

/** Teil des Zeitraums innerhalb eines Kalenderjahrs, sonst null */
export function clipToYear(span: DateSpan, year: number): DateSpan | null {
  const from = span.from < `${year}-01-01` ? `${year}-01-01` : span.from;
  const to = span.to > `${year}-12-31` ? `${year}-12-31` : span.to;
  return from <= to ? { from, to } : null;
}

export interface BridgeSuggestion extends DateSpan {
  /** Urlaubstage */
  cost: number;
  /** Freier Block inklusive der Brücke */
  stretch: DateSpan;
  stretchDays: number;
  /** freie Tage je Urlaubstag */
  efficiency: number;
  /** Feiertage im Block, nach Datum */
  holidayNames: string[];
}

/**
 * Brückentage, die im Jahr beginnen und nach heute liegen, sortiert nach
 * Datum. Zum Rand hin wird ein paar Tage ins Nachbarjahr geschaut, damit
 * Brücken über den Jahreswechsel vollständig sind.
 */
export function bridgeSuggestions(
  year: number,
  todayKey: string,
  ctx: PlannerContext,
): BridgeSuggestion[] {
  const scan = daysOf({
    from: shiftDateKey(`${year}-01-01`, -14),
    to: shiftDateKey(`${year}-12-31`, 14),
  });

  // Abwechselnde Blöcke freier und zu arbeitender Tage
  const segments: Array<{ free: boolean; days: string[] }> = [];
  for (const key of scan) {
    const free = isFreeDay(key, ctx);
    const last = segments[segments.length - 1];
    if (last && last.free === free) last.days.push(key);
    else segments.push({ free, days: [key] });
  }

  const result: BridgeSuggestion[] = [];
  // Brücke über einen oder mehrere Arbeitsblöcke (mit freien Tagen dazwischen),
  // z. B. Mo–Mi vor und Fr nach Himmelfahrt als eine Woche
  for (let first = 1; first < segments.length - 1; first += 1) {
    if (segments[first].free) continue;
    const from = segments[first].days[0];
    if (from <= todayKey || from.slice(0, 4) !== String(year)) continue;
    const before = segments[first - 1];

    let workDays = 0;
    for (let last = first; last < segments.length - 1; last += 2) {
      const work = segments[last];
      workDays += work.days.length;
      if (workDays > MAX_BRIDGE_DAYS) break;
      const after = segments[last + 1];
      const to = work.days[work.days.length - 1];
      // Halb gebuchte Tage kosten nur den offenen Rest
      const cost = spanCost({ from, to }, ctx).open;
      if (cost <= 0) continue;

      const stretch = {
        from: before.days[0],
        to: after.days[after.days.length - 1],
      };
      const holidays = daysOf(stretch).filter((key) => key in ctx.holidays);
      if (holidays.length === 0) continue;
      const stretchDays = spanLength(stretch);
      const efficiency = stretchDays / cost;
      if (efficiency < MIN_BRIDGE_EFFICIENCY) continue;
      result.push({
        from,
        to,
        cost,
        stretch,
        stretchDays,
        efficiency,
        holidayNames: Array.from(
          new Set(holidays.map((key) => ctx.holidays[key])),
        ),
      });
    }
  }
  return result.sort((a, b) => a.from.localeCompare(b.from) || a.cost - b.cost);
}

/** Überschneiden sich zwei Zeiträume? */
export function spansOverlap(a: DateSpan, b: DateSpan): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/** Zeitraum aus zwei angeklickten Tagen, egal in welcher Reihenfolge */
export function spanBetween(a: string, b: string): DateSpan {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

// ---------------------------------------------------------------------------
// API-Typen (GET /api/vacation-planner, /api/vacation-drafts)

export interface VacationDraftDto extends DateSpan {
  id: string;
  note: string | null;
}

export interface VacationPlannerAccount {
  entitlement: number;
  /** genommen bis heute */
  taken: number;
  /** gebucht nach heute (Timewarp, Dialog, Timing) */
  booked: number;
}

export interface VacationPlannerResponse {
  year: number;
  todayKey: string;
  workDays: number[];
  /** Offizielle und importierte Feiertage, Vorjahr bis Folgejahr */
  holidays: Record<string, string>;
  holidayServiceUnavailable: boolean;
  /** Gebuchte Abwesenheit an Arbeitstagen des Jahres */
  booked: BookedDay[];
  account: VacationPlannerAccount;
  /** Entwürfe, die das Jahr berühren */
  drafts: VacationDraftDto[];
  /** Startseite von Timewarp zum Beantragen */
  timewarpUrl: string;
  /** Letzter Kalender-Abgleich; null ohne Feed */
  calendarLastSyncAt: string | null;
  calendarConfigured: boolean;
}

/** Ein Tag aus dem Abwesenheitsbericht als gebuchter Tag; null ohne Belegung */
export function bookedDayFromReport(day: {
  dateKey: string;
  isWorkDay: boolean;
  days: Record<string, number>;
}): BookedDay | null {
  if (!day.isWorkDay) return null;
  const { holiday: _holiday, ...others } = day.days;
  const share = Math.min(
    1,
    Object.values(others).reduce((sum, value) => sum + value, 0),
  );
  if (share <= 0) return null;
  return {
    dateKey: day.dateKey,
    share,
    countsAsVacation: (day.days.vacation ?? 0) > 0,
  };
}

/** Geplant wird im laufenden und im nächsten Jahr, das Vorjahr zum Nachsehen */
export function plannerYearAllowed(year: number, todayKey: string): boolean {
  const current = Number(todayKey.slice(0, 4));
  return Number.isInteger(year) && year >= current - 1 && year <= current + 1;
}

export const MAX_DRAFT_NOTE_LENGTH = 200;

/**
 * Prüft einen Entwurf: gültige Tage, Beginn ≤ Ende, höchstens
 * MAX_DRAFT_DAYS Kalendertage, Beginn im erlaubten Planungsfenster.
 * Gibt die deutsche Fehlermeldung zurück oder null.
 */
export function validateDraftSpan(
  span: DateSpan,
  todayKey: string,
): string | null {
  if (!isDateKey(span.from) || !isDateKey(span.to)) {
    return "Ungültiges Datum (erwartet JJJJ-MM-TT).";
  }
  if (span.from > span.to) return "Der Beginn liegt nach dem Ende.";
  if (!plannerYearAllowed(Number(span.from.slice(0, 4)), todayKey)) {
    return "Geplant wird im Vorjahr, laufenden oder nächsten Jahr.";
  }
  if (shiftDateKey(span.from, MAX_DRAFT_DAYS - 1) < span.to) {
    return `Ein Entwurf umfasst höchstens ${MAX_DRAFT_DAYS} Tage.`;
  }
  return null;
}
