# r-worktime


**Zeiterfassung & Überstundenverwaltung** - Importiert Timing JSON-Exports und trackt automatisch deine Überstunden.

## Features

- 📊 **Import** - JSON-Daten aus Timing App importieren oder direkt per Timing-API synchronisieren
- ⏰ **Überstunden** - Automatische Berechnung von Plus-/Minusstunden
- 📅 **Wochenansicht** - Detaillierte Aufschlüsselung nach Kalenderwochen
- 📈 **Statistiken** - Historische Trends und Monatsübersichten
- 🌙 **Dark Mode** - Augenschonendes UI für späte Arbeitsstunden

## Tech Stack

Next.js 15 • TypeScript • Prisma • PostgreSQL • Tailwind CSS • NextAuth

## Setup

```bash
# Installation
pnpm install

# Datenbank einrichten
pnpm db:push
pnpm db:seed

# Entwicklung
pnpm dev
```

## Umgebungsvariablen

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
TIMING_TOKEN_ENCRYPTION_KEY="..."   # openssl rand -base64 32, für den Timing-Sync
TIMING_SYNC_SCHEDULER="on"          # "off" schaltet den Hintergrund-Sync (Timing und Kalender) ab
CALENDAR_FEED_HOSTS="timewarp.innoq.io"  # erlaubte Hosts für den Kalender-Feed, kommagetrennt
REGISTRATION_ENABLED="false"        # "true" erlaubt neue Accounts über /register
```

## Verwendung

1. **Login** über `/login`. Neue Accounts nur mit `REGISTRATION_ENABLED="true"` über `/register`
2. **Timing verbinden** unter `/settings/timing` oder **Timing-Export hochladen** unter `/upload`
3. **Überstunden prüfen** im Dashboard
4. **Arbeitszeiten konfigurieren** in den Einstellungen

## Timing-Sync

Statt JSON-Dateien zu exportieren, kann r-worktime deine Zeiteinträge direkt über die
[Timing Web API](https://web.timingapp.com/docs/) abgleichen.

**Einrichten**

1. Auf dem Server `TIMING_TOKEN_ENCRYPTION_KEY` setzen (32 Byte, base64 oder hex):
   `openssl rand -base64 32`. Ohne Schlüssel lässt sich kein Token speichern.
2. In Timing unter [Integrations → API Keys](https://web.timingapp.com/integrations/tokens)
   einen persönlichen API-Key erzeugen.
3. In r-worktime unter **Einstellungen → Timing-Sync** (`/settings/timing`) den Key
   speichern, „Verbindung testen“ klicken, Projekt-Wurzeln festlegen und Auto-Sync
   einschalten.

**Was abgeglichen wird**

- Nur Einträge aus den konfigurierten Projekt-Wurzeln (Default `Work`). Der Vergleich
  läuft segmentweise: `Work` passt auf `Work ▸ Kunde A`, aber nicht auf `Workshop`.
  Einträge ohne Projekt und laufende Timer werden ignoriert. Liegen Urlaubs- oder
  Krankheitsprojekte außerhalb dieser Wurzeln, nimm sie als eigene Wurzel auf – sonst
  fehlen sie im Überstundensaldo.
- Jeder Lauf holt ein rollierendes Fenster (Default: die letzten 35 Tage, in
  Europe/Berlin-Kalendertagen) vollständig neu und vergleicht es mit der Datenbank:
  neue Einträge werden angelegt, geänderte aktualisiert, in Timing gelöschte entfernt.
  Schlüssel ist die Timing-ID (`self`), gespeichert als `externalId`.
- An Tagen, für die der Sync Einträge liefert, ersetzt er Einträge aus Datei-Importen.
  Manuelle Einträge, Feiertage, Bulk-Fill und der Anfangs-Saldo bleiben unberührt.
- Über „Zeitraum nachholen“ lässt sich ein längerer Zeitraum (bis 400 Tage) abgleichen,
  z. B. das ganze Jahr. Abgefragt wird in Monatsabschnitten.
- Schlägt ein Lauf fehl (Token ungültig, Rate-Limit, Netzwerk), wird nichts geschrieben;
  der Fehler steht auf der Einstellungsseite.

**Hintergrund-Sync**

`src/instrumentation.ts` startet im Node-Server einen Scheduler, der alle 5 Minuten
prüft, welche Verbindungen fällig sind (Intervall pro Nutzer einstellbar, Default
stündlich). Er läuft im App-Prozess, ein externes Job-System ist nicht nötig. Mit
`TIMING_SYNC_SCHEDULER=off` bleibt nur der manuelle Sync. Pro Nutzer läuft immer nur ein
Sync gleichzeitig.

**Sicherheit**

Der API-Key wird mit AES-256-GCM verschlüsselt in der Tabelle `timing_integrations`
gespeichert (nicht in den Benutzereinstellungen, damit Backups und Exporte ihn nicht
enthalten). Er wird nie geloggt und nie an den Browser zurückgegeben – angezeigt werden
nur die letzten vier Zeichen.

**Mögliche Erweiterung:** Timing bietet OAuth (Dynamic Client Registration, Scope
`mcp:use`) bisher nur für seinen MCP-Server an. Ob solche Tokens auch für die REST-API
gelten, ist nicht dokumentiert – deshalb nutzt r-worktime vorerst den persönlichen
API-Key.

**Manuelle Korrekturen**

Bearbeitest du einen Eintrag aus Timing (Sync oder Datei-Import mit Timing-ID), gilt er
danach als manuell: Sync und Datei-Import überschreiben ihn nicht mehr und legen ihn auch
nicht doppelt an. Alte Datei-Importe ohne Timing-ID lassen sich nicht zuordnen – deren
Korrekturen ersetzt der nächste Sync oder Import dieses Tages.

### Hinweise zum Update

- **Überstundensaldo:** Einträge ohne Beschreibung (z. B. Urlaub aus älteren
  Timing-Importen ohne Titel, manuelle Einträge ohne Text) fielen bisher still aus der
  Saldo-Berechnung. Jetzt zählen sie mit – der angezeigte Saldo kann sich nach dem Update
  daher einmalig ändern. Betroffene Einträge zeigt
  `SELECT type, count(*), sum(duration) FROM time_entries WHERE description IS NULL GROUP BY type;`
- **Alte Backups** (vor diesem Update) kennen keine Quelle. Beim Wiederherstellen gelten
  die Regeln der Migration (Saldo-Marker → Saldo, Feiertag → Feiertag, sonst manuell).
  Frühere Datei-Importe sind darin nicht erkennbar und werden als manuelle Einträge
  wiederhergestellt; Sync oder Datei-Import ersetzen sie dann nicht. Überschreibt ein
  Alt-Backup einen vorhandenen Eintrag, bleiben dessen Quelle und Timing-ID erhalten.
- **Stundenzettel:** Bei manuellen, Bulk-Fill- und Feiertags-Einträgen zählt die
  eingetragene Dauer, nicht die Spanne zwischen Start und Ende.

## Projekt-Struktur

```
src/
├── app/          # Next.js App Router & API Routes
├── components/   # React Komponenten
├── services/     # Business Logic
├── lib/          # Utils & Helpers
└── types/        # TypeScript Definitionen
```

---

**Status:** In aktiver Entwicklung
**Lizenz:** Private
