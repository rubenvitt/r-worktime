# r-worktime

**Zeiterfassung & Überstundenverwaltung** - Importiert Timing JSON-Exports und trackt automatisch deine Überstunden.

## Features

- 📊 **Import** - JSON-Daten aus Timing App importieren
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
```

## Verwendung

1. **Login/Registrierung** über `/login`
2. **Timing-Export hochladen** unter `/upload`
3. **Überstunden prüfen** im Dashboard
4. **Arbeitszeiten konfigurieren** in den Einstellungen

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
