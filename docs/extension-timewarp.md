# Extension: Urlaub aus dem Urlaubsplaner in Timewarp eintragen

Stand: 2026-10-18 · Status: r-worktime-Seite fertig, Extension-Seite offen

## Ziel

Im Urlaubsplaner (`/vacation`) merkst du dir Urlaub als Entwurf. Ein Klick auf „An Extension
senden“ übergibt den Entwurf an die Browser-Extension (`extension/`). Auf der Timewarp-Seite
bietet die Extension dann einen Button an, der den Abwesenheitsantrag ausfüllt. **Abschicken
musst du selbst**, die Extension speichert in Timewarp nie automatisch, genau wie bei Odoo.

Danach schließt sich der Kreis ohne Extension: Der Kalender-Abgleich liest den Timewarp-Feed,
legt die Urlaubstage an (und trägt sie ab dem jeweiligen Tag in Timing ein), und der Planer
zeigt den Entwurf als „In Timewarp gebucht“.

## Was r-worktime schon kann

- `src/hooks/use-odoo-extension.ts` → `sendAbsence(payload)` und `supportsAbsence`
- `src/lib/timesheet/extension-protocol.ts` → Typen `AbsenceMessagePayload`, `RWT_ABSENCE`,
  `RWT_ABSENCE_ACK`, Fähigkeit `ABSENCE_FEATURE = "absence"`
- Der Button „An Extension senden“ erscheint **nur**, wenn die Extension in `RWT_PONG` oder
  `RWT_READY` das Feld `features: ["absence"]` mitschickt. Ohne das bleibt es bei „In Timewarp
  beantragen“ (Zeitraum in die Zwischenablage, Timewarp öffnen). Ältere Extension-Versionen
  stören also nicht.

## Protokoll (Erweiterung von v1)

Gleiche Regeln wie beim Stundenzettel: `window.postMessage` nur an den eigenen Origin, `source`
`"r-worktime"` bzw. `"rwt-extension"`, `protocol: 1`, `requestId` als String.

**PONG/READY** bekommen ein optionales Feld:

```json
{ "source": "rwt-extension", "type": "RWT_PONG", "requestId": "…", "version": "1.2.0",
  "protocol": 1, "features": ["absence"] }
```

**Seite → Extension:**

```json
{
  "source": "r-worktime",
  "type": "RWT_ABSENCE",
  "requestId": "6f1c…",
  "protocol": 1,
  "payload": {
    "draftId": "cmg…",
    "kind": "URLAUB",
    "from": "2027-05-03",
    "to": "2027-05-07",
    "halfDay": false,
    "workDays": 4,
    "note": "Ostsee, mit Hund",
    "generatedAt": "2026-10-18T10:15:00.000Z"
  }
}
```

- `from`/`to`: Kalendertage `YYYY-MM-DD`, beide inklusive (Timewarp-Formulare zeigen meist
  `TT.MM.JJJJ`).
- `kind`: vorerst immer `"URLAUB"`. Später denkbar: `"RESTURLAUB"`, `"SONDERURLAUB"`,
  `"BILDUNGSURLAUB"`, `"UEBERSTUNDENABBAU"` (die Typen aus dem Timewarp-Feed).
- `workDays`: Urlaubstage laut r-worktime (Arbeitstage ohne Feiertage), nur zur Anzeige und
  zum Abgleich mit dem, was Timewarp berechnet.
- `note`: optional, höchstens 200 Zeichen.

**Extension → Seite (ACK):**

```json
{ "source": "rwt-extension", "type": "RWT_ABSENCE_ACK", "requestId": "6f1c…", "ok": true }
```

Fehler wie beim Stundenzettel: `ok: false` mit `error` `VALIDATION`, `TOO_LARGE` oder `ORIGIN`.
Ohne Antwort innerhalb von 3 Sekunden meldet die Seite „Die Extension hat nicht geantwortet“.

## Was in der Extension fehlt

1. **Bridge** (`content/rwt-bridge.js`): `features: ["absence"]` in PONG und READY; Nachricht
   `RWT_ABSENCE` an den Service Worker weiterreichen (`action: "rwtStoreAbsence"`) und das ACK
   zurückgeben, analog zu `RWT_TIMESHEET`.
2. **Service Worker** (`background.js`): Payload prüfen (Datumsformat, `from ≤ to`, höchstens
   62 Tage, `kind` bekannt, Notiz ≤ 200 Zeichen), Origin wie beim Stundenzettel prüfen, in
   `chrome.storage.local` ablegen (eine Abwesenheit zur Zeit reicht; Verfall nach 14 Tagen),
   Badge setzen.
3. **Manifest**: Content Script und Host-Berechtigung für `https://timewarp.innoq.io/*`.
4. **Timewarp-Content-Script** (neu, z. B. `content/timewarp.js`): Auf der Seite für neue
   Abwesenheiten einen schwebenden Button „r-worktime: Urlaub 03.05.–07.05.2027 eintragen“ plus
   „Verwerfen“ zeigen. Klick füllt Art, Von, Bis, halber Tag und Kommentar aus, löst die
   Eingabe-Events aus, die das Formular braucht, und speichert **nicht**. Danach gilt die
   Abwesenheit als verbraucht.
5. **Popup**: gespeicherte Abwesenheit anzeigen (Herkunft, Zeitraum), „Verwerfen“.

Für Schritt 4 muss jemand Timewarp ansehen. Das geht nur angemeldet, also lokal.

- Unter welcher URL liegt das Formular für eine neue Abwesenheit? Lässt sich der Zeitraum
  per Query-Parameter vorbelegen? Dann reicht vielleicht ein Link statt Formularfüllen.
- Welche Felder gibt es (Art als Select oder Radio, Datumsfelder als `<input type="date">`
  oder Datepicker mit Textfeld, halber Tag, Kommentar)? Welche Selektoren sind stabil?
- Welches Datumsformat erwartet das Feld, und auf welche Events reagiert das Formular
  (`input`, `change`, Framework-spezifisch)?
- Rechnet Timewarp die Tage selbst aus? Dann kann der Button sie mit `workDays` vergleichen
  und bei Abweichung warnen.

## Vorschlag für den Prompt

> Erweitere die Browser-Extension in `extension/` um das Eintragen von Urlaub in Timewarp.
> Die Spezifikation steht in `docs/extension-timewarp.md`, die r-worktime-Seite ist fertig
> (`src/lib/timesheet/extension-protocol.ts`, `src/hooks/use-odoo-extension.ts`). Baue Bridge,
> Service Worker und Manifest analog zum Stundenzettel-Import. Analysiere dann die geöffnete
> Timewarp-Seite für neue Abwesenheiten (ich bin angemeldet) und baue das Content Script, das
> das Formular aus der gespeicherten Abwesenheit füllt, ohne abzuschicken. Halte dich an den
> Stil der vorhandenen Dateien (keine Build-Toolchain, deutsche Texte), erhöhe die Version und
> ergänze `extension/README.md`.
