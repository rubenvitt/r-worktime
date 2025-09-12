# Source Tree - r-worktime

## 📁 Projekt-Struktur Übersicht

Dies ist die definitive Referenz für die Projekt-Struktur. Alle neuen Features müssen dieser Struktur folgen.

```
r-worktime/
├── .github/                         # GitHub Configuration
│   └── workflows/                   # CI/CD Workflows
│       ├── ci.yml                  # Test & Lint Pipeline
│       └── deploy.yml               # Deployment Pipeline
│
├── apps/                            # Applikationen (Monorepo)
│   └── web/                        # Next.js Full-Stack App
│       ├── app/                    # App Router Directory
│       │   ├── (auth)/            # Auth Group Route
│       │   │   ├── login/        # Login Page
│       │   │   ├── register/     # Registration Page
│       │   │   └── layout.tsx    # Auth Layout
│       │   │
│       │   ├── (dashboard)/       # Dashboard Group Route
│       │   │   ├── dashboard/    # Main Dashboard
│       │   │   │   ├── page.tsx
│       │   │   │   └── loading.tsx
│       │   │   ├── entries/      # Time Entries
│       │   │   │   ├── page.tsx
│       │   │   │   ├── [id]/
│       │   │   │   └── new/
│       │   │   ├── statistics/   # Statistics Views
│       │   │   │   ├── weekly/
│       │   │   │   ├── monthly/
│       │   │   │   └── overtime/
│       │   │   ├── settings/     # User Settings
│       │   │   └── layout.tsx    # Dashboard Layout
│       │   │
│       │   ├── api/               # API Routes
│       │   │   ├── auth/[...nextauth]/  # Auth API
│       │   │   │   └── route.ts
│       │   │   ├── time-entries/  # Time Entries API
│       │   │   │   ├── route.ts   # GET, POST
│       │   │   │   ├── [id]/
│       │   │   │   │   └── route.ts  # GET, PUT, DELETE
│       │   │   │   └── bulk/
│       │   │   │       └── route.ts  # Bulk operations
│       │   │   ├── upload/        # File Upload API
│       │   │   │   └── route.ts
│       │   │   ├── statistics/    # Statistics API
│       │   │   │   ├── overtime/
│       │   │   │   │   └── route.ts
│       │   │   │   ├── weekly/
│       │   │   │   │   └── route.ts
│       │   │   │   └── monthly/
│       │   │   │       └── route.ts
│       │   │   ├── export/        # Export API
│       │   │   │   └── route.ts
│       │   │   └── health/        # Health Check
│       │   │       └── route.ts
│       │   │
│       │   ├── layout.tsx         # Root Layout
│       │   ├── page.tsx           # Landing Page
│       │   ├── global-error.tsx   # Global Error Handler
│       │   └── not-found.tsx      # 404 Page
│       │
│       ├── components/             # React Components
│       │   ├── ui/                # shadcn/ui Components
│       │   │   ├── button.tsx
│       │   │   ├── card.tsx
│       │   │   ├── dialog.tsx
│       │   │   ├── form.tsx
│       │   │   ├── input.tsx
│       │   │   ├── label.tsx
│       │   │   ├── select.tsx
│       │   │   ├── table.tsx
│       │   │   ├── toast.tsx
│       │   │   └── ...
│       │   │
│       │   ├── dashboard/         # Dashboard Components
│       │   │   ├── overtime-card.tsx
│       │   │   ├── weekly-chart.tsx
│       │   │   ├── recent-entries.tsx
│       │   │   └── stats-grid.tsx
│       │   │
│       │   ├── entries/           # Entry Components
│       │   │   ├── entry-form.tsx
│       │   │   ├── entry-list.tsx
│       │   │   ├── entry-card.tsx
│       │   │   └── upload-zone.tsx
│       │   │
│       │   ├── layout/            # Layout Components
│       │   │   ├── header.tsx
│       │   │   ├── sidebar.tsx
│       │   │   ├── footer.tsx
│       │   │   └── nav-menu.tsx
│       │   │
│       │   └── shared/            # Shared Components
│       │       ├── date-picker.tsx
│       │       ├── time-picker.tsx
│       │       ├── loading-spinner.tsx
│       │       └── error-boundary.tsx
│       │
│       ├── lib/                    # Library Code
│       │   ├── auth.ts            # Auth Configuration
│       │   ├── prisma.ts          # Prisma Client Singleton
│       │   ├── utils.ts           # Utility Functions
│       │   └── constants.ts       # App Constants
│       │
│       ├── hooks/                  # Custom React Hooks
│       │   ├── use-overtime.ts
│       │   ├── use-entries.ts
│       │   ├── use-upload.ts
│       │   └── use-user.ts
│       │
│       ├── services/               # API Service Layer
│       │   ├── overtime.service.ts
│       │   ├── entries.service.ts
│       │   ├── upload.service.ts
│       │   ├── statistics.service.ts
│       │   └── export.service.ts
│       │
│       ├── types/                  # TypeScript Types
│       │   ├── api.ts
│       │   ├── database.ts
│       │   └── ui.ts
│       │
│       ├── styles/                 # Global Styles
│       │   └── globals.css
│       │
│       ├── public/                 # Static Assets
│       │   ├── images/
│       │   └── fonts/
│       │
│       ├── .env.local              # Local Environment
│       ├── .env.example            # Environment Template
│       ├── middleware.ts           # Next.js Middleware
│       ├── next.config.js          # Next.js Config
│       ├── package.json            # Dependencies
│       ├── postcss.config.js       # PostCSS Config
│       ├── tailwind.config.ts      # Tailwind Config
│       └── tsconfig.json           # TypeScript Config
│
├── packages/                        # Shared Packages
│   ├── shared/                     # Shared Code
│   │   ├── src/
│   │   │   ├── types/             # Shared Types
│   │   │   │   ├── time-entry.ts
│   │   │   │   ├── user.ts
│   │   │   │   ├── statistics.ts
│   │   │   │   └── index.ts
│   │   │   ├── constants/         # Shared Constants
│   │   │   │   ├── time.ts
│   │   │   │   └── validation.ts
│   │   │   ├── utils/             # Shared Utils
│   │   │   │   ├── date.ts
│   │   │   │   ├── time.ts
│   │   │   │   └── validation.ts
│   │   │   └── schemas/           # Zod Schemas
│   │   │       ├── time-entry.schema.ts
│   │   │       ├── user.schema.ts
│   │   │       └── upload.schema.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── database/                   # Database Package
│   │   ├── prisma/
│   │   │   ├── schema.prisma      # Prisma Schema
│   │   │   ├── migrations/        # Database Migrations
│   │   │   └── seed.ts           # Seed Data
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── config/                     # Shared Configuration
│       ├── eslint/
│       │   └── index.js
│       ├── typescript/
│       │   └── base.json
│       └── tailwind/
│           └── base.js
│
├── scripts/                         # Build & Deploy Scripts
│   ├── setup.sh                    # Initial Setup
│   ├── migrate.sh                  # Database Migration
│   └── backup.sh                   # Backup Script
│
├── docs/                           # Documentation
│   ├── architecture/              # Architecture Docs
│   │   ├── coding-standards.md
│   │   ├── tech-stack.md
│   │   └── source-tree.md
│   ├── api/                       # API Documentation
│   ├── prd-worktime-tracker.md    # Product Requirements
│   └── architecture.md            # Architecture Overview
│
├── tests/                          # Test Files
│   ├── unit/                      # Unit Tests
│   ├── integration/               # Integration Tests
│   └── e2e/                       # E2E Tests
│       └── playwright/
│
├── .docker/                        # Docker Configuration
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── .husky/                         # Git Hooks
│   ├── pre-commit
│   └── pre-push
│
├── .vscode/                        # VS Code Settings
│   ├── settings.json
│   ├── extensions.json
│   └── launch.json
│
├── .env.example                    # Environment Template
├── .eslintrc.json                  # ESLint Config
├── .gitignore                      # Git Ignore
├── .prettierrc                     # Prettier Config
├── package.json                    # Root Package
├── pnpm-workspace.yaml             # PNPM Workspace
├── turbo.json                      # Turborepo Config
├── README.md                       # Project README
└── LICENSE                         # License File
```

## 📦 Package Details

### apps/web
**Zweck**: Next.js Full-Stack Applikation
```json
{
  "name": "@r-worktime/web",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  }
}
```

### packages/shared
**Zweck**: Geteilte Types, Utils und Schemas
```json
{
  "name": "@r-worktime/shared",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./utils": "./src/utils/index.ts",
    "./schemas": "./src/schemas/index.ts"
  }
}
```

### packages/database
**Zweck**: Prisma Client und Migrations
```json
{
  "name": "@r-worktime/database",
  "main": "./index.ts",
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio"
  }
}
```

## 🔑 Wichtige Dateien

### /apps/web/app/layout.tsx
Root Layout mit Providers:
```typescript
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
```

### /apps/web/lib/auth.ts
NextAuth Configuration:
```typescript
import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "./prisma"

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // ... config
})
```

### /packages/database/prisma/schema.prisma
Database Schema Definition:
```prisma
model User {
  id           String @id @default(cuid())
  email        String @unique
  // ... fields
}

model TimeEntry {
  id       String @id @default(cuid())
  userId   String
  date     DateTime
  duration Decimal
  // ... fields
}
```

## 🚀 Development Workflow

### Initial Setup
```bash
# 1. Clone Repository
git clone https://github.com/username/r-worktime.git
cd r-worktime

# 2. Install Dependencies
pnpm install

# 3. Setup Database
cd packages/database
pnpm db:migrate
pnpm db:seed

# 4. Start Development
cd ../..
pnpm dev
```

### Adding New Features

#### 1. New Page
```bash
# Create new route
mkdir -p apps/web/app/(dashboard)/new-feature
touch apps/web/app/(dashboard)/new-feature/page.tsx
```

#### 2. New Component
```bash
# Create component
touch apps/web/components/new-feature/feature-component.tsx
```

#### 3. New API Route
```bash
# Create API endpoint
mkdir -p apps/web/app/api/new-endpoint
touch apps/web/app/api/new-endpoint/route.ts
```

#### 4. New Shared Type
```bash
# Add to shared package
touch packages/shared/src/types/new-type.ts
# Export from index
echo "export * from './new-type'" >> packages/shared/src/types/index.ts
```

## 📝 Naming Conventions

### Files & Folders
| Type | Convention | Example |
|------|------------|---------|
| Components | kebab-case.tsx | `overtime-card.tsx` |
| Pages | folder/page.tsx | `dashboard/page.tsx` |
| API Routes | folder/route.ts | `time-entries/route.ts` |
| Hooks | use-*.ts | `use-overtime.ts` |
| Services | *.service.ts | `overtime.service.ts` |
| Types | *.ts or *.d.ts | `api.ts` |
| Schemas | *.schema.ts | `user.schema.ts` |

### Import Paths
```typescript
// Absolute imports für apps/web
import { Button } from "@/components/ui/button"
import { useOvertime } from "@/hooks/use-overtime"

// Package imports
import { TimeEntry } from "@r-worktime/shared/types"
import { prisma } from "@r-worktime/database"
```

## 🔄 Git Branch Strategy

```
main                    # Production branch
├── develop            # Development branch
├── feature/*          # Feature branches
├── fix/*             # Bugfix branches
└── release/*         # Release branches
```

### Branch Naming
- `feature/add-weekly-view`
- `fix/overtime-calculation`
- `release/v1.0.0`

## 🚦 File Organization Rules

### ✅ DO
- Gruppiere related files zusammen
- Nutze barrel exports (index.ts)
- Halte components klein und focused
- Trenne business logic von UI

### ❌ DON'T
- Erstelle zu tiefe Verschachtelungen (max 4 levels)
- Mische verschiedene concerns in einem File
- Dupliziere Code (nutze shared packages)
- Hardcode Werte (nutze constants/env)

## 📊 Metriken & Limits

### File Size Limits
- Components: < 200 LOC
- Services: < 300 LOC
- Pages: < 150 LOC (ohne imports)

### Bundle Size Targets
- Initial Load: < 100KB
- Route Chunks: < 50KB
- Images: < 100KB (optimized)

---

**Status**: ✅ Definitive Struktur-Referenz
**Letzte Aktualisierung**: 2025-09-12
**Verantwortlich**: Winston (System Architect)