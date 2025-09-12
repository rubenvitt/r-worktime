# Product Requirements Document (PRD)
## Zeiterfassungs-WebApp mit Überstundentracking

---

## Dokumenteninformationen

- **Version**: 1.0
- **Erstellungsdatum**: 2025-09-11
- **Status**: Draft
- **Autor**: Rubeen (Product Owner)
- **Projekt-Code**: r-worktime

---

## Executive Summary

### Produktvision
Entwicklung einer persönlichen WebApp zur effizienten Erfassung und Verwaltung von Arbeitszeiten mit Fokus auf Überstundentracking. Die Lösung ermöglicht den Upload von bestehenden Timing-Export-Daten und bietet eine klare Visualisierung des aktuellen Stundensaldos.

### Geschäftsziele
- **Primärziel**: Automatisierte Überstundenberechnung und -verfolgung
- **Sekundärziel**: Vereinfachung der persönlichen Zeiterfassung
- **Langfristziel**: Intelligente Überstunden-Abbauplanung

### Zielgruppe
- **Primär**: Einzelnutzer (persönliches Tool)

---

## Produktübersicht

### Problembeschreibung
Manuelle Überstundenberechnung aus Timing-Exports ist zeitaufwändig und fehleranfällig. Es fehlt eine zentrale Übersicht über den aktuellen Stundensaldo und historische Entwicklungen.

### Lösungsansatz
Eine WebApp, die:
1. JSON-Exports aus Timing automatisch verarbeitet
2. Über-/Minusstunden automatisch berechnet
3. Den aktuellen Saldo übersichtlich darstellt
4. Historische Daten analysiert und visualisiert

### Kernwertversprechen
- **Zeitersparnis**: Automatische Berechnung statt manueller Excel-Tabellen
- **Transparenz**: Jederzeit aktueller Überblick über Stundensaldo
- **Planung**: Datenbasierte Entscheidungen für Überstundenabbau

---

## Scope & Phasen

### Phase 1: MVP (Minimum Viable Product)
**Zeitrahmen**: 2 Wochen
**Ziel**: Funktionsfähige Basisversion mit Kernfunktionalität

#### Umfang
- Upload von Timing-JSON-Exports
- Überstundenberechnung
- Anzeige des Gesamtsaldos
- Basis-Authentifizierung

### Phase 2: Essential Features
**Zeitrahmen**: 2 Wochen
**Ziel**: Erweiterte Funktionalität für täglichen Gebrauch

#### Umfang
- Wochenweise Detailansicht
- User-Konfiguration (Soll-Arbeitszeit)
- Historien-Verwaltung
- Verbesserte UI/UX

### Phase 3: Nice-to-Have Features
**Zeitrahmen**: 4+ Wochen
**Ziel**: Zusatzfunktionen für erweiterte Analysen

#### Umfang
- Grafische Visualisierungen
- Trend-Analysen
- Export-Funktionen
- Prognose-Features

### Phase 4: Vision Features
**Zeitrahmen**: Nach erfolgreichem Launch
**Ziel**: Intelligente Überstunden-Management-Features

#### Umfang
- Überstunden-Abbau-Planer
- Urlaubs-Integration
- Empfehlungs-Engine
- Team-Features

---

## Funktionale Anforderungen

### Phase 1: MVP Requirements

#### FR-1.1: Datei-Upload
**Beschreibung**: System muss JSON-Dateien aus Timing akzeptieren und verarbeiten können

**Akzeptanzkriterien**:
- [ ] Drag & Drop Upload-Interface
- [ ] Dateivalidierung (JSON-Format)
- [ ] Fehlerbehandlung bei ungültigen Dateien
- [ ] Upload-Progress-Indikator
- [ ] Maximale Dateigröße: 10MB

#### FR-1.2: Datenverarbeitung
**Beschreibung**: Parsing und Speicherung der Timing-Export-Daten

**Akzeptanzkriterien**:
- [ ] JSON-Struktur wird korrekt geparst
- [ ] Tagesweise Speicherung der Einträge
- [ ] Duplikate-Erkennung implementiert
- [ ] Replace-Logik für überlappende Zeiträume
- [ ] Datenvalidierung (Plausibilitätsprüfung)

#### FR-1.3: Überstundenberechnung
**Beschreibung**: Automatische Berechnung von Über-/Minusstunden

**Akzeptanzkriterien**:
- [ ] Vergleich Ist-Stunden mit Soll-Stunden
- [ ] Berücksichtigung von Sonderzeiten (Urlaub, Krankheit)
- [ ] Kumulierte Berechnung über alle Zeiträume
- [ ] Genauigkeit auf 0.25 Stunden

#### FR-1.4: Dashboard
**Beschreibung**: Übersichtliche Darstellung des aktuellen Stundensaldos

**Akzeptanzkriterien**:
- [ ] Prominente Anzeige des Gesamtsaldos
- [ ] Farbcodierung (Grün = Plus, Rot = Minus)
- [ ] Letzte Aktualisierung sichtbar
- [ ] Responsive Design (Mobile/Desktop)

#### FR-1.5: Benutzer-Authentifizierung
**Beschreibung**: Basis-Login-System für Datenschutz

**Akzeptanzkriterien**:
- [ ] Username/Password Login
- [ ] Session-Management
- [ ] Logout-Funktionalität
- [ ] Password-Hashing (bcrypt)

### Phase 2: Essential Features Requirements

#### FR-2.1: Wochenansicht
**Beschreibung**: Detaillierte Aufschlüsselung nach Kalenderwochen

**Akzeptanzkriterien**:
- [ ] Navigation zwischen Wochen
- [ ] Wochensaldo-Anzeige
- [ ] Tagesweise Auflistung
- [ ] Ist vs. Soll Vergleich pro Woche
- [ ] Kumulierter Saldo bis zur gewählten Woche

#### FR-2.2: Benutzer-Konfiguration
**Beschreibung**: Persönliche Einstellungen für Arbeitszeiten

**Akzeptanzkriterien**:
- [ ] Konfigurierbare Wochenarbeitszeit
- [ ] Arbeitstage festlegen
- [ ] Standardarbeitszeiten definieren
- [ ] Einstellungen persistieren

#### FR-2.3: Import-Preview
**Beschreibung**: Vorschau vor dem endgültigen Import

**Akzeptanzkriterien**:
- [ ] Anzeige betroffener Tage
- [ ] Warnung bei Wochenend-Einträgen
- [ ] Anzeige zu ersetzender Einträge
- [ ] Bestätigung/Abbruch Option

#### FR-2.4: Daten-Management
**Beschreibung**: Verwaltung gespeicherter Zeiteinträge

**Akzeptanzkriterien**:
- [ ] Einzelne Einträge löschen
- [ ] Zeiträume löschen
- [ ] Export der eigenen Daten
- [ ] Daten-Backup Funktion

### Phase 3: Nice-to-Have Requirements

#### FR-3.1: Visualisierungen
**Beschreibung**: Grafische Darstellung der Überstunden-Entwicklung

**Akzeptanzkriterien**:
- [ ] Liniendiagramm für Verlauf
- [ ] Balkendiagramm für Wochenvergleich
- [ ] Monats-/Quartalsansichten
- [ ] Interaktive Charts (Hover-Details)

#### FR-3.2: Trend-Analyse
**Beschreibung**: Statistische Auswertungen

**Akzeptanzkriterien**:
- [ ] Durchschnittliche Überstunden pro Woche/Monat
- [ ] Trend-Indikator (steigend/fallend)
- [ ] Prognose bei aktuellem Tempo
- [ ] Vergleich mit Vorperioden

#### FR-3.3: Zeitkategorisierung
**Beschreibung**: Unterscheidung zwischen abrechenbaren, nicht-abrechenbaren Zeiten und Abwesenheiten

**Akzeptanzkriterien**:
- [ ] Kategorisierung von Arbeitszeiten (abrechenbar/nicht-abrechenbar)
- [ ] Separate Anzeige von Abwesenheiten (Krankheit, Urlaub, Feiertage)
- [ ] Prozentuale Verteilung der Zeitkategorien
- [ ] Filterbare Ansichten nach Kategorie
- [ ] Farbcodierung für verschiedene Zeittypen
- [ ] Monatliche/wöchentliche Aufschlüsselung nach Kategorien

#### FR-3.4: Export-Funktionen
**Beschreibung**: Datenexport für externe Verwendung

**Akzeptanzkriterien**:
- [ ] CSV-Export
- [ ] PDF-Report Generation
- [ ] Excel-kompatibles Format
- [ ] Zeitraum-basierter Export

---

## Nicht-funktionale Anforderungen

### NFR-1: Performance
- **Ladezeit**: < 2 Sekunden für Dashboard
- **Upload-Verarbeitung**: < 5 Sekunden für 1MB JSON
- **Datenbankabfragen**: < 100ms für Standard-Queries
- **Concurrent Users**: Mindestens 10 (zukünftig)

### NFR-2: Sicherheit
- **Authentifizierung**: JWT-basiert
- **Passwort-Policy**: Mindestens 8 Zeichen, 1 Zahl, 1 Sonderzeichen
- **HTTPS**: Verschlüsselte Übertragung
- **DSGVO**: Konforme Datenspeicherung

### NFR-3: Benutzerfreundlichkeit
- **Responsive Design**: Mobile, Tablet, Desktop
- **Browser-Support**: Chrome, Firefox, Safari (letzte 2 Versionen)
- **Barrierefreiheit**: WCAG 2.1 Level A
- **Intuitive Navigation**: Ohne Dokumentation nutzbar

### NFR-4: Wartbarkeit
- **Code-Coverage**: Mindestens 70% Testabdeckung
- **Dokumentation**: API-Dokumentation (OpenAPI)
- **Logging**: Strukturiertes Logging (Winston)
- **Monitoring**: Health-Check Endpoint

### NFR-5: Skalierbarkeit
- **Architektur**: Microservice-ready
- **Datenbank**: Horizontal skalierbar
- **Caching**: Redis-Integration vorbereitet
- **Container**: Docker-ready

---

## Technische Spezifikationen

### Tech-Stack

#### Backend
- **Framework**: NestJS (v10+)
- **Sprache**: TypeScript
- **ORM**: Prisma
- **Datenbank**: PostgreSQL (v17+)
- **Authentication**: Passport.js + JWT

#### Frontend
- **Build-Tool**: Vite (v5+)
- **Framework**: React (v18+)
- **Styling**: Tailwind CSS
- **State Management**: TanStack Store + TanStack Query
- **API Client**: OpenAPI generierter Code (openapi-typescript-codegen)
- **Charts**: Chart.js oder D3.js

#### Infrastructure
- **Container**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Hosting**:
  - Development: Localhost
  - Production: TBD (Vercel/Railway/Self-hosted)

### Datenmodell

#### Entitäten

**User**
```typescript
{
  id: CUID
  username: string
  email: string
  passwordHash: string
  settings: JSON
  createdAt: timestamp
  updatedAt: timestamp
}
```

**TimeEntry**
```typescript
{
  id: CUID
  userId: CUID
  date: date
  startTime: time
  endTime: time
  duration: decimal
  type: enum (WORK, VACATION, SICK, HOLIDAY)
  billable: boolean
  projectName?: string
  description?: string
  createdAt: timestamp
  updatedAt: timestamp
}
```

**UserSettings**
```typescript
{
  id: CUID
  userId: CUID
  weeklyHours: decimal
  workDays: array<number>
  defaultStartTime: time
  defaultEndTime: time
  timezone: string
}
```

**ImportLog**
```typescript
{
  id: CUID
  userId: CUID
  fileName: string
  importDate: timestamp
  affectedDates: array<date>
  replacedEntries: number
  newEntries: number
  status: enum (SUCCESS, PARTIAL, FAILED)
}
```

### API-Spezifikation

#### Authentication Endpoints
```
POST   /api/auth/login     - User login
POST   /api/auth/logout    - User logout
POST   /api/auth/refresh   - Token refresh
POST   /api/auth/register  - User registration
```

#### Time Entry Endpoints
```
GET    /api/entries         - List all entries
POST   /api/entries/upload  - Upload JSON file
GET    /api/entries/week/:year/:week - Get week data
DELETE /api/entries/:id     - Delete entry
GET    /api/entries/export  - Export data
```

#### Statistics Endpoints
```
GET    /api/stats/overtime  - Current overtime balance
GET    /api/stats/weekly    - Weekly statistics
GET    /api/stats/monthly   - Monthly statistics
GET    /api/stats/trends    - Trend analysis
```

#### Settings Endpoints
```
GET    /api/settings        - Get user settings
PUT    /api/settings        - Update settings
```

---

## User Stories

### Phase 1 User Stories

#### US-1.1: Als Nutzer möchte ich meine Timing-Exports hochladen
**Akzeptanzkriterien**:
- Ich kann JSON-Dateien per Drag & Drop hochladen
- Ich erhalte Feedback über den Upload-Status
- Ungültige Dateien werden mit verständlicher Fehlermeldung abgelehnt

#### US-1.2: Als Nutzer möchte ich meinen aktuellen Überstundensaldo sehen
**Akzeptanzkriterien**:
- Der Saldo ist prominent auf dem Dashboard sichtbar
- Positive/negative Stunden sind farblich unterschieden
- Die Zahl ist auf 15 Minuten genau

#### US-1.3: Als Nutzer möchte ich mich sicher anmelden können
**Akzeptanzkriterien**:
- Ich kann mich mit Username/Password anmelden
- Meine Session bleibt für 24h aktiv
- Ich kann mich explizit abmelden

### Phase 2 User Stories

#### US-2.1: Als Nutzer möchte ich meine Wochenarbeitszeit konfigurieren
**Akzeptanzkriterien**:
- Ich kann meine Soll-Stunden pro Woche festlegen
- Ich kann meine Arbeitstage definieren
- Änderungen werden sofort in Berechnungen berücksichtigt

#### US-2.2: Als Nutzer möchte ich eine Wochenübersicht meiner Zeiten
**Akzeptanzkriterien**:
- Ich kann zwischen Kalenderwochen navigieren
- Ich sehe täglich Ist vs. Soll
- Der Wochensaldo ist klar ersichtlich

#### US-2.3: Als Nutzer möchte ich vor dem Import eine Vorschau sehen
**Akzeptanzkriterien**:
- Ich sehe welche Tage betroffen sind
- Ich werde bei ungewöhnlichen Einträgen gewarnt
- Ich kann den Import abbrechen

---

## Meilensteine & Zeitplan

### Phase 1: MVP (Wochen 1-2)

**Woche 1**
- [ ] Tag 1-2: Projekt-Setup (NestJS, PostgreSQL, Docker)
- [ ] Tag 3-4: Datenmodell & Migrations
- [ ] Tag 5: Upload-Endpoint & JSON-Parsing

**Woche 2**
- [ ] Tag 1-2: Überstundenberechnung Logic
- [ ] Tag 3-4: Basis-Frontend & Dashboard
- [ ] Tag 5: Testing & Bug-Fixing

### Phase 2: Essential Features (Wochen 3-4)

**Woche 3**
- [ ] Tag 1-2: Wochenansicht Implementation
- [ ] Tag 3-4: User-Settings & Konfiguration
- [ ] Tag 5: Import-Preview Feature

**Woche 4**
- [ ] Tag 1-2: Daten-Management Features
- [ ] Tag 3-4: UI/UX Verbesserungen
- [ ] Tag 5: Integration Testing

### Phase 3: Nice-to-Have (Wochen 5+)
- Woche 5-6: Visualisierungen
- Woche 7-8: Trend-Analysen
- Woche 9+: Export-Features

---

## Risiken & Mitigationsstrategien

### Technische Risiken

**R1: Komplexität der Timing-JSON-Struktur**
- **Wahrscheinlichkeit**: Mittel
- **Impact**: Hoch
- **Mitigation**: Frühzeitige Analyse der Export-Formate, flexible Parser-Implementierung

**R2: Performance bei großen Datenmengen**
- **Wahrscheinlichkeit**: Niedrig
- **Impact**: Mittel
- **Mitigation**: Indexierung, Pagination, Caching-Strategie

**R3: Duplikate-Handling Komplexität**
- **Wahrscheinlichkeit**: Hoch
- **Impact**: Mittel
- **Mitigation**: Klare Replace-Logik, ausführliche Tests

### Projekt-Risiken

**R4: Scope Creep**
- **Wahrscheinlichkeit**: Hoch
- **Impact**: Mittel
- **Mitigation**: Strikte Phasen-Trennung, MVP-First Ansatz

**R5: Zeit-Investment**
- **Wahrscheinlichkeit**: Mittel
- **Impact**: Niedrig
- **Mitigation**: Realistische Zeitplanung, Priorisierung

---

## Erfolgsmetriken

### Phase 1 KPIs
- Upload funktioniert für 100% der Test-Exports
- Überstundenberechnung mit 100% Genauigkeit
- Ladezeit Dashboard < 2 Sekunden

### Phase 2 KPIs
- Wochenansicht-Navigation ohne Bugs
- Settings-Änderungen sofort wirksam
- User-Zufriedenheit > 80%

### Phase 3 KPIs
- Visualisierungen performant (< 1s Render)
- Export-Funktionen fehlerfrei
- Feature-Adoption > 60%

---

## Glossar

- **Timing**: Externes Zeiterfassungstool
- **Saldo**: Differenz zwischen Ist- und Soll-Arbeitszeit
- **Überstunden**: Positive Differenz zum Soll
- **Minusstunden**: Negative Differenz zum Soll
- **Replace-Logik**: Strategie zum Ersetzen bestehender Einträge
- **Sonderzeiten**: Nicht-Arbeitszeiten (Urlaub, Krankheit)

---

## Anhänge

### A: Timing JSON-Format Beispiel
```json
[
  {
    "activityTitle" : "[Context] | [Ticket]: [Aktivität]",
    "duration" : "1:09:51",
    "endDate" : "2025-09-11T06:29:51Z",
    "id" : "3774418809547176960",
    "notes" : "Bugfixing falsches Service-Verhalten",
    "project" : "Work ▸ my-company ▸ Kundenprojekte ▸ kunde ▸ context",
    "startDate" : "2025-09-11T05:20:00Z"
  },
  {
    "activityTitle" : "[Aktivität]",
    "duration" : "1:09:51",
    "endDate" : "2025-09-11T06:29:51Z",
    "id" : "3774418809547176960",
    "notes" : "Bugfixing falsches Service-Verhalten",
    "project" : "Work ▸ my-company ▸ Intern ▸ context",
    "startDate" : "2025-09-11T05:20:00Z"
  },
  {
    "activityTitle" : "Krank",
    "duration" : "1:09:51",
    "endDate" : "2025-09-11T06:29:51Z",
    "id" : "3774418809547176960",
    "notes" : "",
    "project" : "Work ▸ my-company ▸ Krankheit",
    "startDate" : "2025-09-11T05:20:00Z"
  },
]
```

### B: Technische Entscheidungsdokumentation
- Warum NestJS: Enterprise-ready, TypeScript-first
- Warum PostgreSQL: Robuste relationale Datenbank
- Warum Docker: Einfaches Deployment, Konsistenz

---

## Änderungshistorie

| Version | Datum | Autor | Änderungen |
|---------|-------|-------|------------|
| 1.0 | 2025-09-11 | Rubeen | Initiale Version basierend auf Brainstorming |

---

## Freigabe & Genehmigung

**Product Owner**: Rubeen
**Technischer Lead**: Rubeen
**Stakeholder**: Rubeen (Personal Project)

**Status**: ✅ Reviewed

---

*Dieses Dokument ist ein lebendiges Dokument und wird iterativ während der Entwicklung aktualisiert.*
