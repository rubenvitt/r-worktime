// biome-ignore-all lint: 1:1-Kopie aus r-times, Logik unverändert
//
// Referenzimplementierung für den Differential-Test – NICHT im App-Code verwenden.
// Herkunft: r-times (github.com/rubenvitt/r-times), Commit 07a7ddd, src/App.svelte:
//   TRAVEL_KEYWORDS + detectTravelFee (:38-57), copyAllAsJson (:163-177),
//   formatActivitiesWithMeetingGroups (:180-213), isTitleWithParentheses (:222-224),
//   formatMins (:226-231), processData (:248-416).
// Anpassungen: Svelte-State (`rounding`, `days`, `metadata`) als Parameter/Rückgabe,
// Typannotationen, Formatierung per Biome; Logik unverändert. Tagesgrenze ist hier immer UTC.

interface Activity {
  title: string;
  minutes: number;
  notes: string[];
  isTitleWithParentheses: boolean;
  hasMissingEntries: boolean;
}

export interface RTimesDayEntry {
  date: string;
  minutes: number;
  activities: Activity[];
  hasIncompleteActivities: boolean;
  hasCriticalActivities: boolean;
  missingEntries: {
    activity: string;
    start: string;
    end: string;
    isCritical: boolean;
  }[];
  isExpanded: boolean;
  travelFee: boolean;
}

const TRAVEL_KEYWORDS = [
  "präsenztag",
  "präsenz",
  "vor ort",
  "vorort",
  "dienstreise",
  "onsite",
  "on-site",
  "on site",
];

function detectTravelFee(activities: Activity[]): boolean {
  for (const act of activities) {
    const haystack = (act.title + " " + act.notes.join(" ")).toLowerCase();
    for (const kw of TRAVEL_KEYWORDS) {
      if (haystack.includes(kw)) return true;
    }
  }
  return false;
}

// Kopiert alle Aktivitäten als JSON (statt Clipboard: Rückgabe)
export function rTimesCopyAllAsJson(days: RTimesDayEntry[], rounding: number) {
  const jsonData = days.map((day) => {
    // Aktivitäten für einen Tag zusammenfassen mit Gruppierung von Meeting-Einträgen
    const activitiesText = rTimesFormatActivitiesWithMeetingGroups(
      day.activities,
    );

    return {
      date: day.date,
      hours: rTimesFormatMins(day.minutes, rounding),
      text: activitiesText,
      travelFee: day.travelFee,
    };
  });

  return jsonData;
}

// Formatiert Aktivitäten und gruppiert dabei Meeting-Einträge mit Klammern
export function rTimesFormatActivitiesWithMeetingGroups(
  activities: Activity[],
): string {
  // Gruppiere Meeting-Einträge für Zusammenfassung
  const meetingGroups = new Map<string, string[]>();
  const regularActivities: Activity[] = [];

  // Identifiziere Meetings-Einträge und gruppiere sie nach Basisnamen
  activities.forEach((act) => {
    const meetingMatch = act.title.match(/^(.+)\((.+)\)$/);
    if (meetingMatch && meetingMatch[1] === "Meetings") {
      // Extrahiere den Basisteil und den Klammerinhalt
      const [, baseName, bracketContent] = meetingMatch;
      if (!meetingGroups.has(baseName)) {
        meetingGroups.set(baseName, []);
      }
      meetingGroups.get(baseName)!.push(bracketContent);
    } else {
      regularActivities.push(act);
    }
  });

  // Formatiere normale Aktivitäten
  const regularLines = regularActivities.map((act) => {
    const notes = act.notes.join(", ");
    return notes ? `${act.title} # ${notes}` : act.title;
  });

  // Formatiere zusammengefasste Meeting-Gruppen
  const meetingLines = Array.from(meetingGroups.entries()).map(
    ([baseName, contents]) => {
      return `${baseName}(${contents.join(", ")})`;
    },
  );

  // Kombiniere alle Aktivitäten und gib sie zurück
  return [...meetingLines, ...regularLines].join("; ");
}

// Prüft, ob der Titel im Format "Title(Text)" ist
function isTitleWithParentheses(title: string): boolean {
  return /^.+\(.+\)$/.test(title.trim());
}

export function rTimesFormatMins(mins: number, rounding: number) {
  const rounded = Math.round(mins / rounding) * rounding;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

export function rTimesProcessData(data: any): RTimesDayEntry[] {
  let days: RTimesDayEntry[];
  const records: any[] = Array.isArray(data)
    ? data
    : (data.records ?? data.activities ?? []);

  // Metadaten initialisieren
  let startDate = "";
  let endDate = "";
  let totalMinutes = 0;

  // Erste Verarbeitung: Einträge nach Tag und Aktivität gruppieren
  const dayMap = new Map<
    string,
    {
      total: number;
      map: Map<
        string,
        {
          mins: number;
          notes: string[];
          isTitleWithParentheses: boolean;
          entries: { hasNotes: boolean; start: string; end: string }[];
        }
      >;
    }
  >();

  // Alle Einträge sammeln
  records.forEach((rec) => {
    const start = new Date(rec.start || rec.startDate);
    const end = new Date(rec.end || rec.endDate || rec.stopDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    const date = start.toISOString().split("T")[0];
    const durMins = Math.round((end.getTime() - start.getTime()) / 60000);

    // Metadaten aktualisieren
    if (!startDate || date < startDate) startDate = date;
    if (!endDate || date > endDate) endDate = date;
    totalMinutes += durMins;

    if (!dayMap.has(date))
      dayMap.set(date, {
        total: 0,
        map: new Map(),
      });

    const day = dayMap.get(date)!;
    day.total += durMins;

    const title = rec.activityTitle || rec.project || "Ohne Titel";
    const note = rec.notes ?? "";
    const hasParentheses = isTitleWithParentheses(title);

    // Zeit für den Eintrag
    const startTime = new Date(rec.start || rec.startDate)
      .toISOString()
      .split("T")[1]
      .substr(0, 5);
    const endTime = new Date(rec.end || rec.endDate || rec.stopDate)
      .toISOString()
      .split("T")[1]
      .substr(0, 5);

    // Aktivität zur Map hinzufügen
    if (!day.map.has(title)) {
      day.map.set(title, {
        mins: 0,
        notes: [],
        isTitleWithParentheses: hasParentheses,
        entries: [],
      });
    }

    const act = day.map.get(title)!;
    act.mins += durMins;
    act.isTitleWithParentheses = hasParentheses;

    // Notiz hinzufügen und Einträge verfolgen
    if (note && !act.notes.includes(note)) act.notes.push(note);

    // Eintrag hinzufügen
    act.entries.push({
      hasNotes: !!note || hasParentheses,
      start: startTime,
      end: endTime,
    });
  });

  // Zweite Verarbeitung: Nach Tag die Aktivitäten auswerten und fehlende Notizen identifizieren
  days = Array.from(dayMap.entries())
    .map(([date, { total, map }]) => {
      const activities: Activity[] = [];
      const missingEntries: {
        activity: string;
        start: string;
        end: string;
        isCritical: boolean;
      }[] = [];

      let hasCriticalActivities = false;
      let hasIncompleteActivities = false;

      // Für jede Aktivität an diesem Tag
      for (const [
        title,
        { mins, notes, isTitleWithParentheses, entries },
      ] of map.entries()) {
        // Anzahl Einträge ohne Notizen
        const entriesWithoutNotes = entries.filter((e) => !e.hasNotes);

        // Wenn diese Aktivität gar keine Notizen hat und nicht im Title(Text) Format ist,
        // dann ist sie kritisch
        const isActivityCritical =
          notes.length === 0 && !isTitleWithParentheses;

        if (isActivityCritical) {
          hasCriticalActivities = true;
        }

        // Wenn es Einträge ohne Notizen gibt, aber die Aktivität selbst nicht kritisch ist
        const hasMissingEntries =
          entriesWithoutNotes.length > 0 && !isActivityCritical;

        if (hasMissingEntries) {
          hasIncompleteActivities = true;
        }

        // Aktivität zur Liste hinzufügen
        activities.push({
          title,
          minutes: mins,
          notes,
          isTitleWithParentheses,
          hasMissingEntries,
        });

        // Einträge ohne Notizen zur Liste der fehlenden Einträge hinzufügen
        entriesWithoutNotes.forEach((entry) => {
          missingEntries.push({
            activity: title,
            start: entry.start,
            end: entry.end,
            isCritical: isActivityCritical,
          });
        });
      }

      const sortedActivities = activities.sort((a, b) => b.minutes - a.minutes);
      return {
        date,
        minutes: total,
        activities: sortedActivities, // Nach Dauer sortieren
        hasIncompleteActivities,
        hasCriticalActivities,
        missingEntries,
        isExpanded: false,
        travelFee: detectTravelFee(sortedActivities),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Metadaten (startDate, endDate, totalMinutes) werden hier nicht gebraucht
  void startDate;
  void endDate;
  void totalMinutes;

  return days;
}
