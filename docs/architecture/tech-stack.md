# Technology Stack - r-worktime

## 🎯 Definitive Technology Choices

Dies ist die **verbindliche Technologie-Referenz** für das gesamte Projekt. Alle Entwicklungs-Entscheidungen müssen sich an diesen Vorgaben orientieren.

## 📊 Stack Übersicht

| Layer | Technologie | Version | Zweck |
|-------|------------|---------|--------|
| **Frontend Framework** | Next.js | 15.0+ | Full-Stack React Framework mit App Router |
| **Backend Framework** | Next.js API Routes | 15.0+ | Serverless API Endpoints |
| **Sprache** | TypeScript | 5.3+ | Type Safety für Frontend & Backend |
| **Database** | PostgreSQL + Prisma | PG 17 / Prisma 5.7+ | Relationale Datenbank mit Type-safe ORM |
| **Styling** | Tailwind CSS | 3.4+ | Utility-first CSS Framework |
| **UI Components** | shadcn/ui | Latest | Kopierbare React Components |
| **State Management** | TanStack Query | 5.0+ | Server State Management |
| **Authentication** | NextAuth.js | 5.0+ (Auth.js) | Authentication für Next.js |
| **Deployment** | Vercel | - | Optimiert für Next.js |

## 🔧 Detaillierte Stack-Komponenten

### Frontend

#### Core Framework
```json
{
  "framework": "Next.js 15.0+",
  "routing": "App Router",
  "rendering": "Server Components + Client Components",
  "data_fetching": "Server Actions + TanStack Query"
}
```

#### UI Layer
```typescript
// UI Stack
const uiStack = {
  components: "shadcn/ui",        // Basis-Komponenten
  styling: "Tailwind CSS",        // Styling
  icons: "lucide-react",          // Icon Library
  forms: "react-hook-form + zod", // Form Handling & Validation
  charts: "recharts",             // Datenvisualisierung
  animations: "framer-motion"     // Animations (optional)
};
```

#### State Management
```typescript
// Client State
- TanStack Query für Server State
- Zustand für lokalen UI State (wenn nötig)
- React Context für globale Settings

// Server State
- Server Components für statische Daten
- Server Actions für Mutations
```

### Backend

#### API Architecture
```typescript
// Next.js API Routes (App Router)
app/
  api/
    auth/[...nextauth]/route.ts  // Auth endpoints
    time-entries/
      route.ts                    // GET, POST
      [id]/route.ts              // GET, PUT, DELETE
    upload/route.ts              // File upload
    statistics/
      overtime/route.ts          // Overtime calculations
      weekly/route.ts            // Weekly stats
```

#### Database Layer
```prisma
// Prisma Schema
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}

// Prisma Features verwendet:
- Migrations
- Type-safe Client
- Prisma Studio (Development)
```

#### Authentication
```typescript
// NextAuth.js v5 (Auth.js) Configuration
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      // Email/Password Authentication
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 Tage
  }
})
```

### Development Tools

#### Build & Bundle
```json
{
  "bundler": "Turbopack (Next.js integrated)",
  "package_manager": "pnpm",
  "monorepo": "Turborepo",
  "typescript": "5.3+",
  "linting": "ESLint 8 + Prettier",
  "git_hooks": "Husky + lint-staged"
}
```

#### Testing Stack
```typescript
// Testing Pyramid
const testingStack = {
  unit: "Vitest",                    // Unit Tests
  integration: "Vitest + MSW",       // Integration Tests
  e2e: "Playwright",                  // E2E Tests
  component: "React Testing Library", // Component Tests
  api: "Supertest"                   // API Tests
};
```

## 📦 Package Structure (Monorepo)

```yaml
packages:
  shared:
    description: "Geteilte Types, Utils, Constants"
    dependencies:
      - zod (validation schemas)

  database:
    description: "Prisma Client & Migrations"
    dependencies:
      - "@prisma/client": "^5.7.0"
      - prisma: "^5.7.0"

  ui:
    description: "Shared UI Components"
    dependencies:
      - react: "^18.2.0"
      - "@radix-ui/*": "latest"
      - tailwindcss: "^3.4.0"

apps:
  web:
    description: "Next.js Frontend + API"
    framework: "Next.js 15.0+"
```

## 🚀 Deployment Stack

### Production Environment
```yaml
Platform: Vercel
Features:
  - Automatic Deployments
  - Preview Deployments
  - Edge Functions
  - Analytics
  - Speed Insights

Database: Vercel Postgres oder Supabase
  - Connection Pooling
  - Automatic Backups
  - Point-in-time Recovery
```

### Development Environment
```yaml
Local:
  - Docker Compose für PostgreSQL
  - pnpm dev für Next.js
  - Prisma Studio für DB Management

Tools:
  - VS Code mit Extensions
  - Thunder Client / Postman für API Tests
  - pgAdmin für Database Management
```

## 📋 Dependency Versions (package.json)

### Core Dependencies
```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0-rc",
    "react-dom": "^19.0.0-rc",
    "typescript": "^5.3.0",
    "@prisma/client": "^5.7.0",
    "next-auth": "^5.0.0-beta",
    "@auth/prisma-adapter": "^1.0.0"
  }
}
```

### UI Dependencies
```json
{
  "dependencies": {
    "@radix-ui/react-dialog": "^1.0.0",
    "@radix-ui/react-dropdown-menu": "^2.0.0",
    "@radix-ui/react-label": "^2.0.0",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-slot": "^1.0.0",
    "@radix-ui/react-toast": "^1.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "lucide-react": "^0.300.0",
    "tailwind-merge": "^2.2.0",
    "tailwindcss-animate": "^1.0.0"
  }
}
```

### Data & Forms
```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "react-hook-form": "^7.48.0",
    "zod": "^3.22.0",
    "@hookform/resolvers": "^3.3.0",
    "date-fns": "^3.0.0",
    "recharts": "^2.10.0"
  }
}
```

### Development Dependencies
```json
{
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.0.0",
    "eslint-config-next": "^14.0.0",
    "postcss": "^8.4.0",
    "prettier": "^3.1.0",
    "prisma": "^5.7.0",
    "tailwindcss": "^3.4.0",
    "vitest": "^1.0.0",
    "@playwright/test": "^1.40.0"
  }
}
```

## 🔄 Migrations-Pfad

### Von Existing Architecture v1.0
Die ursprüngliche Architektur sah NestJS vor. Migration zu Next.js weil:

1. **Vereinfachte Architektur**: Ein Framework für Frontend & Backend
2. **Better DX**: Hot Reload, Type Safety durchgehend
3. **Deployment**: Vercel Integration out-of-the-box
4. **Performance**: Server Components, Edge Runtime
5. **Maintenance**: Weniger Dependencies, ein Build Process

### Migration Steps
```bash
# 1. Setup Next.js 15 Projekt
pnpm create next-app@latest r-worktime --typescript --tailwind --app --turbopack

# 2. Prisma Setup
pnpm add prisma @prisma/client
pnpm prisma init

# 3. Auth Setup
pnpm add next-auth@beta @auth/prisma-adapter

# 4. UI Components
pnpm dlx shadcn-ui@latest init
```

## 🛠️ Environment Variables

### Required Environment Variables
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/worktime"
DATABASE_URL_UNPOOLED="postgresql://user:password@localhost:5432/worktime"

# Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Production Environment
```env
# Vercel automatisch gesetzt
VERCEL_URL
VERCEL_ENV

# Database (Vercel Postgres)
POSTGRES_URL
POSTGRES_URL_NON_POOLING
POSTGRES_USER
POSTGRES_HOST
POSTGRES_PASSWORD
POSTGRES_DATABASE
```

## 📝 Technologie-Entscheidungen

### Warum Next.js statt NestJS?
- **Full-Stack Framework**: Frontend und Backend in einem
- **Server Components**: Optimale Performance
- **Vercel Deployment**: Zero-Config Deployment
- **Smaller Bundle**: Weniger JavaScript im Browser

### Warum PostgreSQL?
- **Relational Data**: Klare Beziehungen zwischen Entities
- **ACID Compliance**: Datenintegrität garantiert
- **JSON Support**: Flexibilität für Timing-Daten
- **Prisma Support**: Excellent TypeScript Integration

### Warum Tailwind CSS?
- **Rapid Development**: Utility-first approach
- **Consistency**: Design System built-in
- **Performance**: Nur verwendete Styles im Bundle
- **shadcn/ui**: Ready-to-use Components

### Warum TanStack Query?
- **Server State Management**: Caching, Synchronization
- **Optimistic Updates**: Better UX
- **Background Refetching**: Daten immer aktuell
- **DevTools**: Excellent Debugging

## 🚦 Technologie-Regeln

### ✅ IMMER verwenden
- TypeScript strict mode
- Server Components wo möglich
- Prisma für alle DB Operations
- Zod für Validation
- TanStack Query für Data Fetching

### ❌ NIEMALS verwenden
- JavaScript (immer TypeScript)
- Direct SQL Queries (immer Prisma)
- localStorage für sensitive Daten
- Client-side ENV variables für Secrets
- CSS-in-JS Libraries (Tailwind verwenden)

## 📚 Wichtige Dokumentation

- [Next.js Docs](https://nextjs.org/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [NextAuth.js Docs](https://authjs.dev)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [shadcn/ui Docs](https://ui.shadcn.com)
- [TanStack Query Docs](https://tanstack.com/query)

---

**Status**: ✅ Verbindliche Technologie-Referenz
**Letzte Aktualisierung**: 2025-09-12
**Verantwortlich**: Winston (System Architect)
