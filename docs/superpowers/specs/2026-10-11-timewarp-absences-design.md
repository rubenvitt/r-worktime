# Abwesenheiten aus Timewarp, mit Eintrag in Timing

Stand: 2026-10-11 · Status: Entwurf zur Durchsicht

## Ziel

Abwesenheiten (vor allem Urlaub) plant Ruben in Timewarp, dem HR-Tool von INNOQ. R-Worktime liest den Timewarp-Kalenderfeed regelmäßig, zeigt die Abwesenheiten an, rechnet sie in Saldo, Urlaubskonto und Prognose ein und trägt Urlaubstage automatisch in Timing ein. Stornierungen in Timewarp löschen die Einträge in R-Worktime und Timing wieder.

Erfolg heißt:
- Ein in Timewarp geplanter Urlaub erscheint nach spätestens einer Stunde in R-Worktime (Berichte › Abwesenheiten, Prognose) und als Eintrag in Timing.
- Eine Stornierung in Timewarp entfernt die von R-Worktime angelegten Einträge in beiden Systemen.
- Bestehende Urlaubseinträge in Timing werden nie gelöscht und nie verdoppelt.

Nicht Ziel:
- Schreiben in den Kalender oder nach Timewarp.
- Krankheit aus Timewarp (steht nicht im geteilten Feed).
- Timewarp-Events („Event in Köln“) als Reisetage. Kann später folgen.

## Ausgangslage

**Timewarp-Feed** (ICS, geheime URL, `timewarp.innoq.io/export/<token>/calendar.ics`):
- `VEVENT` mit `DTSTART;VALUE=DATE` / `DTEND;VALUE=DATE` (Ende exklusiv; bei Events teils `DTEND = DTSTART`), `UID`, `SEQUENCE`, optional `STATUS:CANCELLED`.
- `SUMMARY` im Format `<Name>: <TYP>` bzw. `<Name>: <TYP> (halber Tag)`, z. B. `Ruben Vitt: URLAUB`, `Ruben Vitt: RESTURLAUB (halber Tag)`, `Ruben Vitt: Event in Köln`.
- Stornierte Abwesenheiten bleiben mit `STATUS:CANCELLED` im Feed.
- Der Feed reicht nur wenige Tage zurück (beobachtet: ab 08.10.2026) und bis Ende des Folgejahres.
- Typen laut Timewarp-Einstellung: Urlaub, Sonderurlaub, Überstundenabbau, Mutterschutz, Unbezahlter Urlaub, Bildungsurlaub, Sabbatical, Elternzeit, Resturlaub, Event.

**Timing:** Urlaub liegt im Projekt `Work ▸ INNOQ ▸ Urlaub`, als 08:00–16:00 (8 h) bzw. halber Tag 08:00–12:00, `not_billable`. Vergangene Urlaube stehen dort bereits und kommen über den bestehenden Timing-Sync in R-Worktime. Der Sync liest das Fenster [heute − 35 Tage, heute] und schreibt bisher nichts.

**R-Worktime:** Saldo und Berichte arbeiten mit `TimeEntry` (Typen `WORK`, `OVERTIME`, `VACATION`, `SICK`, `HOLIDAY`). Abwesenheiten werden je Tag bis zum Tagessoll gutgeschrieben, nur an Tagen mit Soll (`summarizeRange` in `src/lib/reports/year.ts`). Der Dialog „Abwesenheit eintragen“ (`src/lib/absence-range.ts`, `POST /api/time-entries/absences`) legt Urlaub/Krankheit für Zeiträume an.

## Regeln je Abwesenheitsart

| Timewarp-Typ | `AbsenceKind` | Eintragstyp | Saldo | Urlaubskonto | Timing-Eintrag |
|---|---|---|---|---|---|
| URLAUB | `VACATION` | `VACATION` | Gutschrift bis Tagessoll | belastet | ja |
| RESTURLAUB | `RESIDUAL_VACATION` | `VACATION` | Gutschrift bis Tagessoll | belastet | ja |
| SONDERURLAUB | `SPECIAL_LEAVE` | `VACATION` | Gutschrift bis Tagessoll | belastet nicht | ja |
| BILDUNGSURLAUB | `EDUCATIONAL_LEAVE` | `VACATION` | Gutschrift bis Tagessoll | belastet nicht | ja |
| ÜBERSTUNDENABBAU | `OVERTIME_REDUCTION` | `OVERTIME_REDUCTION` | Soll bleibt, keine Gutschrift | belastet nicht | nein |
| UNBEZAHLTER URLAUB | `UNPAID_LEAVE` | `UNPAID_LEAVE` | Soll 0, keine Gutschrift | belastet nicht | nein |
| ELTERNZEIT | `PARENTAL_LEAVE` | `UNPAID_LEAVE` | Soll 0, keine Gutschrift | belastet nicht | nein |
| MUTTERSCHUTZ | `MATERNITY_LEAVE` | `UNPAID_LEAVE` | Soll 0, keine Gutschrift | belastet nicht | nein |
| SABBATICAL | `SABBATICAL` | `UNPAID_LEAVE` | Soll 0, keine Gutschrift | belastet nicht | nein |
| EVENT | – | – | – | – | – |

- „(halber Tag)“: Dauer = halbes Tagessoll, im Urlaubskonto ½ Tag.
- Tage: nur Arbeitstage laut `workDays`, ohne offizielle und importierte Feiertage (vorhandene Logik aus `src/lib/absence-range.ts`).
- `VACATION`-Einträge ohne verknüpfte Abwesenheit (Timing-Sync, Dialog ohne Absence, Altbestand) belasten das Urlaubskonto wie bisher.
- `OVERTIME_REDUCTION`: Die Problemerkennung meldet den Tag nicht als fehlend.
- Typvergleich ohne Groß-/Kleinschreibung und mit vereinheitlichten Umlauten (`ÜBERSTUNDENABBAU`, `UEBERSTUNDENABBAU`). Unbekannte Typen werden übersprungen und im Protokoll gemeldet.

## Datenmodell

Eine Migration.

**`CalendarIntegration`** (1:1 zu `User`, `@@map("calendar_integrations")`):
- `feedUrlEnc String?` – AES-256-GCM wie `TimingIntegration.apiTokenEnc` (`src/lib/crypto.ts`).
- `syncEnabled Boolean @default(false)`
- `writeToTiming Boolean @default(true)`
- `timingProjectId String?` – Timing-Projekt-Referenz für Urlaubseinträge.
- `lastSyncAt DateTime?`, `lastSyncStatus String?`, `lastSyncError String?`, `lastSyncStats Json?`
- `createdAt`, `updatedAt`
- Bewusst getrennt von `UserSettings`, damit Backup/Export die URL nicht mitnehmen (wie bei Timing).

**`Absence`** (`@@map("absences")`):
- `id`, `userId` (Cascade)
- `source AbsenceSource` – `TIMEWARP` | `MANUAL`
- `externalUid String?` – Timewarp-`UID`; `@@unique([userId, externalUid])`
- `kind AbsenceKind` (siehe Tabelle), `rawType String?` (Text aus `SUMMARY` nach dem Namen)
- `startDate DateTime @db.Date`, `endDate DateTime @db.Date` (inklusiv)
- `halfDay Boolean @default(false)`
- `status AbsenceStatus` – `ACTIVE` | `CANCELLED`
- `sequence Int?`, `lastSeenAt DateTime?`
- `createdAt`, `updatedAt`; `@@index([userId, startDate])`

**`AbsenceSyncLog`** (`@@map("absence_sync_logs")`): `id`, `userId`, `startedAt`, `finishedAt`, `status`, `error String?`, `actions Json` (Liste `{date, kind, action, detail}`), Aufbewahrung der letzten 50 Läufe je Nutzer.

**`TimeEntry`:**
- `absenceId String?` mit Relation zu `Absence` (`onDelete: SetNull`), `@@index([absenceId])`.
- `EntrySource` neu: `TIMEWARP` – von diesem Abgleich angelegt; nur solche Einträge löscht der Abgleich.
- `EntryType` neu: `OVERTIME_REDUCTION`, `UNPAID_LEAVE`.

**Backup/Restore:** `Absence` und verknüpfte `absenceId` werden gesichert und wiederhergestellt; `CalendarIntegration` und `AbsenceSyncLog` nicht. Alte Backups ohne diese Daten bleiben gültig.

## Abgleich

**Auslöser:** stündlich im bestehenden Scheduler (`src/lib/timing/scheduler.ts`, eigener Fälligkeitscheck je `CalendarIntegration`), zusätzlich „Jetzt abgleichen“ (`POST /api/calendar/sync`). Pro Nutzer höchstens ein Lauf; Sperre `pg_advisory_xact_lock` je Nutzer, dieselbe wie im Abwesenheits-Dialog, damit Dialog und Abgleich sich nicht überschneiden.

**1. Feed laden** (`src/lib/calendar/feed.ts`)
- Nur `https`, Host muss in der Allowlist stehen (Umgebungsvariable `CALENDAR_FEED_HOSTS`, Standard `timewarp.innoq.io`), keine Weiterleitungen auf andere Hosts.
- Timeout 10 s, maximal 2 MB.
- Fehler: Lauf endet mit Status `error`, Fehlertext ohne URL/Token ins Protokoll, nichts wird geändert.

**2. Feed auswerten** (`src/lib/calendar/timewarp.ts`, rein)
- Parsen mit `ical.js` (neue Abhängigkeit).
- Nur ganztägige `VEVENT`. `SUMMARY` → Typ nach dem ersten `": "`, Suffix `(halber Tag)` → `halfDay`.
- Ende exklusiv → `endDate = DTEND − 1 Tag`; bei `DTEND ≤ DTSTART` gilt ein Tag.
- Ergebnis: Liste `{uid, sequence, kind, rawType, startDate, endDate, halfDay, cancelled}` plus Zähler für Events und unbekannte Typen.

**3. `Absence` abgleichen** (Plan rein in `src/lib/calendar/plan-absences.ts`)
- Neue UID → anlegen (`ACTIVE` bzw. `CANCELLED`).
- Bekannte UID → Felder aktualisieren, `lastSeenAt` setzen; `STATUS:CANCELLED` → `CANCELLED`.
- `TIMEWARP`-Abwesenheit fehlt im Feed: liegt `startDate` nach heute → `CANCELLED`; sonst unverändert lassen (aus dem Feed gefallen, kein Storno).

**4. Tage abgleichen** (Plan rein in `src/lib/calendar/plan-days.ts`)
- Soll-Tage je aktiver Abwesenheit über die vorhandene Tageslogik; stornierte Abwesenheiten haben keine Soll-Tage.
- Für jeden Soll-Tag ohne verknüpften Eintrag:
  - Gibt es an dem Tag schon einen Eintrag desselben Eintragstyps ohne `absenceId` (Timing-Sync oder manuell) → verknüpfen (`absenceId` setzen), nicht nach Timing schreiben.
  - Sonst, bei Arten mit Timing-Eintrag und `writeToTiming`: Timing nach einem vorhandenen Eintrag im eingestellten Projekt an dem Tag fragen; gefunden → dessen ID übernehmen, sonst in Timing anlegen. Danach lokalen Eintrag speichern: `source TIMEWARP`, `externalId` = Timing-ID, `absenceId`.
  - Sonst: nur lokalen Eintrag (`source TIMEWARP`, ohne `externalId`).
  - Eigener Eintrag ohne `externalId` (Timing war beim Anlegen noch nicht eingerichtet), Timing jetzt eingerichtet: in Timing nachtragen (erst suchen, dann übernehmen, verknüpfen oder anlegen). Belegt Timing den Tag schon anders, bleibt der lokale Eintrag ohne Aktion.
  - Als eigener Timing-Eintrag gilt nur einer mit genau der Notiz „Aus Timewarp“. Fremde Einträge werden nur verknüpft, wenn sie in den Projekt-Wurzeln des Timing-Syncs liegen; sonst würde der Timing-Sync sie als gelöscht behandeln.
- Für jeden verknüpften Eintrag, der kein Soll-Tag mehr ist:
  - `source TIMEWARP` → in Timing löschen (falls `externalId`), dann lokal löschen. Antwortet Timing beim Löschen mit 404, gilt der Eintrag als gelöscht.
  - andere Herkunft → nur `absenceId` entfernen.
- Halber Tag ändert sich (z. B. ganz → halb): Eintrag in Timing und lokal ersetzen.

**Timing-Eintrag** (`src/lib/timing/client.ts`, neue Methoden `createTimeEntry`, `deleteTimeEntry`):
- Ganzer Tag 08:00–16:00, halber Tag 08:00–12:00 Berliner Zeit; Dauer = Tagessoll bzw. halbes Tagessoll (Ende = Beginn + Dauer).
- Titel = Art („Urlaub“, „Resturlaub“, „Sonderurlaub“, „Bildungsurlaub“), Notiz „Aus Timewarp“, `billing_status: not_billable`, Projekt = `timingProjectId`.
- Ohne `timingProjectId` oder ohne Timing-Token: keine Timing-Einträge, Hinweis im Protokoll und in den Einstellungen.

**5. Protokoll und Status:** `AbsenceSyncLog` mit allen Aktionen (`created`, `linked`, `timingCreated`, `timingAdopted`, `deleted`, `unlinked`, `skippedUnknownType`, `failed`), `lastSync*` an der Integration.

**Zusammenspiel mit dem Timing-Sync** (`src/lib/timing/plan-sync.ts`): Ein eingehender Timing-Eintrag, dessen `externalId` an einem Eintrag mit `source TIMEWARP` hängt, gilt als verknüpft: kein Update, kein Konflikt, kein Löschen. Ein `TIMEWARP`-Eintrag im Fenster, den Timing nicht mehr liefert, wird vom Timing-Sync nicht gelöscht (das entscheidet der Abgleich). Einen verknüpften Tag unterdrückt der Timing-Sync nur, wenn Timing den Eintrag wirklich nicht mehr kennt – nicht, wenn ihn nur der Wurzel-Filter verwirft. Die Einstellungen warnen, wenn das Urlaubsprojekt außerhalb der Wurzeln liegt.

**Fehlerfälle:**
- Timing nicht erreichbar oder Fehler beim Anlegen: Tag bleibt ohne Eintrag, Aktion `failed`, nächster Lauf versucht es erneut (mit vorheriger Suche in Timing, daher keine Duplikate).
- Lokales Speichern scheitert nach dem Anlegen in Timing: nächster Lauf findet den Timing-Eintrag über die Suche und übernimmt ihn.
- Eintrag in Timing von Hand gelöscht: Der Abgleich legt ihn nicht neu an, solange der lokale Eintrag existiert (er prüft vorhandene Einträge nicht gegen Timing).
- Feed liefert eine UID mit niedrigerer `SEQUENCE` als gespeichert: ignorieren.

## Oberfläche

**Einstellungen › Kalender** (`/settings/calendar`, Eintrag in `settings-nav.tsx`, Aufbau wie `/settings/timing`):
- Feed-URL-Feld; gespeichert verschlüsselt, angezeigt nur Host + „…“. Speichern prüft per Testabruf und meldet „3 Abwesenheiten, 21 Events, 0 unbekannte Typen“.
- Timing-Projekt als Auswahl aus `GET /projects` (Timing), vorbelegt mit dem ersten Projekt, dessen Pfad „Urlaub“ enthält; Schalter „Urlaube in Timing eintragen“; Schalter „Automatisch abgleichen“.
- Statuskarte: letzter Abgleich, Fehler, „Jetzt abgleichen“.
- Protokoll der letzten Läufe mit ihren Aktionen.

**Berichte › Abwesenheiten** (`src/components/reports/absences/*`):
- Liste „Abwesenheiten {Jahr}“ als Blöcke: Zeitraum, Art, Tage, Status (geplant / genommen / storniert durchgestrichen), Herkunft (Timewarp / manuell / Timing). `VACATION`-Einträge aus dem Timing-Sync ohne `absenceId` werden zu Blöcken aufeinanderfolgender Arbeitstage zusammengefasst.
- Urlaubskonto: belastende Arten getrennt von Sonderurlaub/Bildungsurlaub; eigene Zeilen für Überstundenabbau und unbezahlte Abwesenheit.
- Kalender: Farben für die neuen Eintragstypen.
- Hinweis „Kalender zuletzt abgeglichen …“ mit Link zu den Einstellungen.

**Dialog „Abwesenheit eintragen“:** legt zusätzlich eine `Absence` (`source MANUAL`) an und verknüpft die Einträge. Manuelle Blöcke lassen sich in der Liste als Ganzes löschen (`DELETE /api/absences/[id]`, löscht nur Einträge mit dieser `absenceId`). Der Dialog schreibt nicht nach Timing.

**Übrige Stellen:** Beschriftungen und Farben der neuen Eintragstypen in Woche, Zeiteinträgen, Labels (`src/lib/labels.ts`), Filter und CSV-Export.

## Saldo, Berichte, Prognose

- `summarizeRange`/`dayTargetHours`/`absenceCreditHours`: `UNPAID_LEAVE` setzt das Tagessoll auf 0; `OVERTIME_REDUCTION` lässt das Soll und schreibt nichts gut.
- Abwesenheiten-Bericht und Urlaubskonto: Belastung nach `Absence.kind`, Einträge ohne Abwesenheit wie bisher.
- Prognose: geplante Tage aller Arten fließen ein (Urlaubsarten mindern das verfügbare Soll wie bisher, `UNPAID_LEAVE` setzt Soll 0, `OVERTIME_REDUCTION` mindert das erwartete Ist, nicht das Soll).
- Problemerkennung: `OVERTIME_REDUCTION`- und `UNPAID_LEAVE`-Tage sind keine fehlenden Tage.

## Tests

- Rein, test-first:
  - `timewarp.ts`: anonymisiertes Beispiel in der echten Feed-Struktur (Urlaub, Resturlaub halber Tag, storniert, Event mit `DTEND = DTSTART`, unbekannter Typ, Umlaut-Varianten).
  - `plan-absences.ts`: neu, geändert, storniert, `SEQUENCE` niedriger, verschwunden in Zukunft vs. Vergangenheit.
  - `plan-days.ts`: anlegen, verknüpfen mit vorhandenem Timing-/manuellem Eintrag, Timing-Eintrag übernehmen, löschen eigener, entkoppeln fremder, Zeitraum verkürzt/verlängert, ganz ↔ halb, Feiertag im Zeitraum, Arten ohne Timing.
  - Saldo/Jahr/Abwesenheiten/Prognose/Problemerkennung für die neuen Typen und das Urlaubskonto nach Art.
- Timing-Client: `createTimeEntry`/`deleteTimeEntry` mit gemocktem `fetch` (Request-Body, 404 beim Löschen).
- `plan-sync.ts`: verknüpfter `TIMEWARP`-Eintrag im Fenster → weder Konflikt noch Duplikat noch Löschung.
- Service-Test für den Abgleich mit gemockter DB und gemocktem Timing-Client (Muster `timing-sync.service.test.ts`), inklusive Fehler beim Anlegen und Wiederholung.
- Feed-Laden: Allowlist, Weiterleitung auf fremden Host, Timeout, Größenlimit.
- Browser mit Demo-Daten und lokalem Test-Feed (Datei über einen lokalen Host in der Allowlist nur für Tests).

## Umsetzungsreihenfolge und Vorab-Prüfung

1. **API-Prüfung (mit Ankündigung):** mit Rubens Timing-Token einen Testeintrag in der Zukunft im Urlaubsprojekt anlegen, lesen und löschen. Klärt: Zukunft erlaubt, Request-Format, Antwort mit ID, Löschen. Fällt die Prüfung negativ aus, wird dieser Teil neu entschieden, bevor weitergebaut wird.
2. Migration und Typen.
3. Feed laden und auswerten.
4. Abgleichspläne und Service, Timing-Client-Erweiterung, Anpassung Timing-Sync.
5. Saldo/Berichte/Prognose/Problemerkennung für die neuen Typen.
6. Einstellungen › Kalender, Berichte › Abwesenheiten, Dialog-Anpassung.
7. Backup/Restore, Demo-Seed.

## Offene Punkte

- Ob die Timing-API Einträge mit Datum in der Zukunft annimmt (Schritt 1).
- Titel in Timing: Rubens bisherige Titel sind sprechend („Osterurlaub“). Der Feed liefert nur den Typ; Titel = Art ist der Kompromiss.
