# INNOQ Timesheet Import – Browser-Extension für R-Worktime

Diese Extension trägt Stundenzettel in die INNOQ-Odoo-Timesheet-Tabelle ein. Die Daten kommen auf zwei Wegen:

- **Direktversand aus R-Worktime** (neu in 1.1.0): Auf der Seite „Stundenzettel“ in R-Worktime schickt „An Odoo-Extension senden“ den Monat an die Extension.
- **Zwischenablage**: wie bisher, JSON aus R-Worktime oder R-Times kopieren und im Popup importieren.

Die Extension ist eine Kopie von `r-times/chrome-extension` mit den Änderungen für R-Worktime. Es gibt keine Build-Toolchain, alle Dateien werden direkt geladen. Nur das Manifest unterscheidet sich je Browser, siehe Abschnitt „Firefox“.

## Funktionen

- Direktversand aus R-Worktime über eine Brücke (`postMessage` → Content Script → Service Worker)
- Schwebender Button auf der Odoo-Timesheet-Seite: „r-worktime: September 2026 (21 Tage) eintragen“ plus „Verwerfen“
- Monatsprüfung: Passt der Monat in der Odoo-URL (`…/timesheets/YYYYMM/…`) nicht zu den Daten, bleibt der Button gesperrt; dieselbe Prüfung gilt für „In Tabelle eintragen“ im Popup
- Import aus der Zwischenablage im JSON-Format (unverändert)
- Popup und schwebender Button zeigen die Herkunft der gespeicherten Daten („Von R-Worktime empfangen am … · von https://…“ oder „Aus Zwischenablage“); Daten von `localhost` sind als „lokale Entwicklungsinstanz“ markiert
- Fortschrittsanzeige und visuelle Rückmeldung beim Eintragen; gespeichert wird in Odoo nie automatisch

## Installation („Entpackt laden“)

1. Öffne Chrome und navigiere zu `chrome://extensions/`.
2. Aktiviere den „Entwicklermodus“ (oben rechts).
3. Klicke auf „Entpackte Erweiterung laden“.
4. Wähle den Ordner `extension/` aus diesem Repository aus (oder `dist/extension/chrome/` nach `pnpm build:extension`).

Nach einem Update der Dateien auf `chrome://extensions/` bei der Extension auf „Neu laden“ klicken und offene R-Worktime- und Odoo-Tabs neu laden.

## Optionen

Rechtsklick auf das Extension-Icon → „Optionen“ (oder im Popup „Einstellungen“):

| Feld | Bedeutung |
|---|---|
| Odoo URL | Ziel von „Zu Odoo wechseln“ im Popup |
| R-Time URL | Ziel von „R-Time App öffnen“ (alte R-Times-App, bleibt unverändert) |
| R-Worktime URL (`rWorktimeUrl`) | Adresse deiner R-Worktime-Instanz, z. B. `https://worktime.example.org` |

Für `http://localhost:3000` und `http://localhost:3002` ist die Brücke fest im Manifest eingetragen – dafür brauchst du keine Einstellung.

Für eine andere Adresse fragt der Browser beim Speichern nach der Berechtigung für genau diesen Origin (`optional_host_permissions`). Danach registriert der Service Worker die Brücke dynamisch (`scripting.registerContentScripts`). Bereits offene R-Worktime-Tabs musst du einmal neu laden. Nur `https://` ist erlaubt. Wechselst du die Adresse, gibt die Extension die Berechtigung für die alte Adresse zurück. Beim Browserstart und nach Updates gleicht der Service Worker die Registrierung neu ab.

## Verwendung

### Direktversand aus R-Worktime

1. In R-Worktime den Stundenzettel öffnen, Monat wählen und „An Odoo-Extension senden“ klicken. Das Extension-Icon zeigt dann ein Badge „1“.
2. Die Odoo-Timesheet-Seite des passenden Monats öffnen. Unten rechts erscheint der Button „r-worktime: <Monat> (<n> Tage) eintragen“.
3. Klicken, Ergebnis prüfen, in Odoo selbst speichern.

Alternativ geht das Eintragen auch über das Popup („In Tabelle eintragen“). Nach erfolgreichem Eintragen gelten die Daten als verbraucht; der Button verschwindet. Nicht eingetragene Daten verfallen nach 14 Tagen. „Verwerfen“ löscht sie sofort.

### Zwischenablage

1. JSON in R-Worktime (oder R-Times) kopieren.
2. In Odoo die Timesheet-Seite öffnen, Extension-Icon klicken, „Aus Zwischenablage importieren“.
3. Vorschau prüfen und „In Tabelle eintragen“ klicken.

## Format der Daten

Ein Element pro Tag, aufsteigend nach Datum, alle Tage im selben Monat (die Odoo-Tabelle wird nur über den Tag `DD` abgeglichen):

```json
[
  {
    "date": "2026-09-01",
    "hours": "8:30",
    "text": "Alpha | 101: Backend # API-Design; Meetings(Daily)",
    "travelFee": false
  },
  {
    "date": "2026-09-02",
    "hours": "7:45",
    "text": "Beta | 202: Workshop",
    "travelFee": true
  }
]
```

`travelFee: true` hakt in Odoo die Reisekosten-Checkbox an; `false` oder ein fehlendes Feld ändert nichts.

## Protokoll v1 (Seite ↔ Extension)

Seite und Brücke sprechen über `window.postMessage`. `targetOrigin` ist immer `window.location.origin`, nie `"*"`. Beide Seiten akzeptieren nur Nachrichten mit `event.source === window` und `event.origin === location.origin`. Die Richtung trennt das Feld `source`.

```text
Seite → Ext:  {source:'r-worktime',    type:'RWT_PING',     requestId}
Ext → Seite:  {source:'rwt-extension', type:'RWT_PONG',     requestId, version:'1.1.0', protocol:1}
Ext → Seite:  {source:'rwt-extension', type:'RWT_READY',    version, protocol:1}   // einmalig bei document_start, best effort
Seite → Ext:  {source:'r-worktime',    type:'RWT_TIMESHEET', requestId, protocol:1,
               payload:{month:'2026-09', generatedAt:'ISO', entries:[{date:'2026-09-01', hours:'8:30', text:'…', travelFee:false}]}}
Ext → Seite:  {source:'rwt-extension', type:'RWT_TIMESHEET_ACK', requestId, ok:true, count:21}
              | {…, ok:false, error:'VALIDATION'|'TOO_LARGE'|'ORIGIN'}
```

- `requestId`: String (1–128 Zeichen) oder Zahl. Nachrichten ohne gültige `requestId` werden ignoriert.
- `RWT_PING` darf `protocol` weglassen; ist es gesetzt, muss es `1` sein. `RWT_TIMESHEET` braucht `protocol: 1`.
- Erkennung: Seite sendet `RWT_PING` und wartet ca. 500 ms auf `RWT_PONG`.
- Kommt auf `RWT_TIMESHEET` kein ACK (Service Worker nicht erreichbar oder interner Fehler), läuft die Seite in ihren Timeout.

Prüfung im Service Worker (`lib/timesheet-schema.js`, `validateTimesheetPayload`):

- Absender: eigene Extension, Hauptframe, Origin `http://localhost:3000`, `http://localhost:3002` oder die gespeicherte R-Worktime-Adresse – sonst `ORIGIN`
- Payload als JSON höchstens 64 KB – sonst `TOO_LARGE`
- `month` = `YYYY-MM`; `entries` 1 bis 31 Einträge; `date` = gültiges `YYYY-MM-DD` im Monat, jedes Datum nur einmal; `hours` String nach `^\d{1,2}([:.,]\d{1,2})?$` (bei `:` Minuten < 60); `text` String mit höchstens 500 Zeichen; `travelFee` optionaler Boolean; `generatedAt` optionaler ISO-Zeitstempel – sonst `VALIDATION`
- Unbekannte Felder werden verworfen.

## Sicherheit

- Der Service Worker ist der einzige Schreiber für Daten aus R-Worktime. `chrome.storage.local` ist auf `TRUSTED_CONTEXTS` beschränkt, Content Scripts kommen nur per Nachricht an die Daten (`rwtGetPending`).
- Das Odoo-Content-Script prüft die Daten vor dem Eintragen noch einmal mit demselben Schema.
- Ausgefüllt wird nur nach Klick und mit sichtbarer Vorschau; in Odoo gespeichert wird nie automatisch.
- DOM-Ausgaben nur über `textContent`.
- Daten liegen nur in `storage.local`, nie in `storage.sync`.

## Firefox

Firefox unterstützt in MV3 keinen Service Worker, sondern nur `background.scripts`. Chrome warnt umgekehrt bei `background.scripts` („requires manifest version of 2 or lower“). Deshalb enthält `extension/manifest.json` nur `service_worker`; die Firefox-Variante erzeugt das Build-Skript:

```bash
pnpm build:extension   # → dist/extension/chrome/ und dist/extension/firefox/
```

In Firefox `about:debugging#/runtime/this-firefox` öffnen, „Temporäres Add-on laden“ und `dist/extension/firefox/manifest.json` wählen.

Die Brücke funktioniert grundsätzlich auch in Firefox. Nicht verifiziert sind `persistAcrossSessions`, `storage.local.setAccessLevel` und eine eventuell nötige `browser_specific_settings.gecko.id`. Host-Berechtigungen sind in Firefox faktisch optional; auch für localhost musst du sie dort eventuell in den Extension-Einstellungen erlauben.

## Entwicklung

- `manifest.json`: Konfiguration der Extension (Chrome; die Firefox-Variante erzeugt `scripts/build-extension.mjs`)
- `background.js`: Service Worker (Router, Prüfung, Speichern, Registrierung der Brücke, Badge)
- `lib/timesheet-schema.js`: gemeinsame Prüfung für SW, Popup und Content Scripts
- `content/rwt-bridge.js`: Brücke auf der R-Worktime-Seite
- `content/content.js`, `content/content.css`: Odoo-Seite (Ausfüllen, schwebender Button)
- `popup/`: Popup-UI
- `options/`: Einstellungen

Die Extension hat keine externen Abhängigkeiten und verwendet nur Standard-Web-Technologien.

## Lizenz

MIT
