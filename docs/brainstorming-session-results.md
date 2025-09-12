# Brainstorming Session: Zeiterfassungs-WebApp mit Überstundentracking

## Session Information
- **Datum**: 2025-09-11
- **Thema**: WebApp für Timing-Export Upload und Überstunden-Tracking
- **Ansatz**: Progressive Verfeinerung
- **Teilnehmer**: Rubeen + Mary (KI-Analyst)

## Projekt-Kontext
- **Ziel**: Persönliche WebApp zum Upload von Timing-Exports und Tracking von Überstunden
- **Tech-Stack**: NestJS + Vite
- **Budget**: 0€ (Personal Project)
- **Team**: Solo-Entwicklung mit KI-Unterstützung

---

## Phase 1: Core-Funktionalität (MVP)

### Identifizierte Kernfunktionen
Der absolute Kern der Anwendung besteht aus drei untrennbaren Funktionen:

1. **Upload der Timing-Exports**
   - Datei-Upload-Interface
   - Parsing der Export-Formate
   
2. **Berechnung der Über-/Minusstunden**
   - Vergleich mit Soll-Arbeitszeit
   - Akkumulation über Zeiträume
   
3. **Anzeige des aktuellen Stundensaldos**
   - Übersichtliche Visualisierung
   - Wochenweise Aufschlüsselung

### Erkenntnisse
- Diese drei Funktionen bilden eine untrennbare Einheit
- Ohne eine davon wäre die App nicht funktionsfähig
- Speicherung wird zunächst als sekundär betrachtet

---

## Detaillierung der Core-Features

### Upload-Funktion
- **Realität**: Unregelmäßige Uploads mit potentiell überlappenden Zeiträumen
- **Format**: JSON (bereits in anderem Projekt bewährt)
- **Herausforderung**: Duplikate-Handling bei überlappenden Exports
- **Lösung**: Intelligente Merge-Logik oder Duplikat-Erkennung

### Berechnung
- **Wochenarbeitszeit**: Konfigurierbar pro User
- **Sonderzeiten**: Werden mit exportiert (Feiertage, Krankheit, Urlaub)
  - Vorteil: Keine separate Verwaltung in der App nötig
  - Timing kennt bereits alle relevanten Zeiten
- **Berechnungslogik**: 
  - Ist-Stunden aus Export
  - Soll-Stunden aus Konfiguration
  - Differenz = Über-/Minusstunden

### Anzeige
- **Primäre Metrik**: Gesamtsaldo (kumuliert)
- **Format**: +X.X Stunden / -X.X Stunden
- **Visualisierung**: Klare Plus/Minus-Darstellung zum Soll

---

## Technische Entscheidungen

### Duplikate-Handling: Hybrid-Ansatz
- **Basis**: Tagesweise Replace-Logik
- **Workflow**:
  1. Upload zeigt Preview: "Dieser Import betrifft Tage: X, Y, Z"
  2. Warning bei Wochenend-Einträgen VOR Import
  3. Bestehende Einträge dieser Tage werden ersetzt
  4. Option zum manuellen Löschen einzelner Einträge
- **Vorteil**: Klare Logik, keine versteckten Duplikate
- **Gelöschte Einträge**: Werden durch Replace automatisch entfernt

---

## Phase 2: Nice-to-Have Features

### Priorisierung (nach Wichtigkeit)

#### 1. Wochenweise Breakdown-Ansicht (MUSS)
- Detailansicht pro Kalenderwoche
- Zeigt Ist vs. Soll pro Woche
- Wochensaldo und kumulierter Saldo
- Navigation zwischen Wochen

#### 2. Historien-Graphen (SCHÖN)
- Visualisierung der Überstunden-Entwicklung
- Monats-/Quartalsansichten
- Trendlinien

#### 3. Prognose-Feature (OPTIONAL)
- "Bei aktuellem Tempo: Jahresende +X Stunden"
- Nicht prioritär, aber nice-to-have

---

## Phase 3: Zukunftsvision

### Das Killer-Feature: Überstunden-Abbau-Planung
- **Vision**: "Ich habe 40 Überstunden - wann und wie baue ich die ab?"
- **Mögliche Features**:
  - Abbau-Rechner: "X Stunden weniger pro Woche = abgebaut bis Datum Y"
  - Urlaubs-Integration: "Nimm 5 Tage Urlaub = -40 Stunden"
  - Empfehlungen: "Freitags 2h früher = bis März abgebaut"
- **Philosophie**: Simple bleiben, nicht überkomplizieren

---

## Technische Architektur

### Stack-Entscheidungen
- **Datenbank**: PostgreSQL
- **Backend**: NestJS
- **Frontend**: Vite
- **Auth**: Start mit User/Pass, später WebAuthn (OAuth als Option)
- **Deployment**: 
  - Development: Localhost
  - Production: Docker für Backend
  - Optional: Vercel für Frontend (wenn getrennt)

### Architektur-Überlegungen
- **Monolith vs. Separated**: Flexibel halten
- **API-First**: Backend als REST/GraphQL API
- **Docker-Ready**: Von Anfang an containerized denken

---

## Action Plan für die Implementierung

### Phase 1: MVP (Woche 1-2)
1. **Setup & Struktur**
   - NestJS Projekt initialisieren
   - PostgreSQL Schema (users, time_entries, settings)
   - Docker-Setup
   
2. **Core-Features**
   - JSON-Upload Endpoint
   - Tagesweise Replace-Logik mit Preview
   - Überstunden-Berechnung
   - Basis-Dashboard mit Gesamtsaldo

### Phase 2: Essential Features (Woche 3-4)
3. **Wochenansicht**
   - Kalenderwoche-Navigation
   - Wochensaldo-Berechnung
   - Ist vs. Soll Breakdown

4. **User Management**
   - Simple Auth (User/Pass)
   - Arbeitszeit-Konfiguration
   - Persönliche Settings

### Phase 3: Nice-to-Haves (Woche 5+)
5. **Visualisierung**
   - Chart.js Integration
   - Historien-Graphen
   - Trend-Analyse

6. **Überstunden-Abbau-Planer** (Version 2.0)
   - Abbau-Szenarien
   - Empfehlungs-Engine
   - Prognose-Tools

---

## Konkrete Nächste Schritte

### Sofort startbar:
1. Projekt-Setup mit NestJS + TypeORM + PostgreSQL
2. Timing JSON Format analysieren und Types erstellen
3. Datenbank-Schema entwerfen
4. Upload-Endpoint mit Validation
5. Frontend-Grundgerüst mit Vite + React/Vue

### Offene Entscheidungen:
- Frontend-Framework: React, Vue, oder Svelte?
- UI-Library: Tailwind, Material, oder Custom?
- Monorepo oder getrennte Repos?