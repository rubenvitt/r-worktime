# Technische Architektur-Dokumentation
## Zeiterfassungs-WebApp mit Überstundentracking

---

## Dokumenteninformationen

- **Version**: 1.0
- **Erstellungsdatum**: 2025-09-11
- **Status**: Draft
- **Autor**: Winston (System Architect)
- **Basiert auf**: PRD v1.0

---

## Executive Summary

Diese Architektur-Dokumentation erweitert das bestehende PRD um technische Implementierungsdetails, die speziell für eine Single-User-Anwendung mit niedrigen Skalierungsanforderungen optimiert sind. Der Fokus liegt auf Einfachheit, Wartbarkeit und Container-basiertem Deployment.

---

## System-Architektur Übersicht

### High-Level Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│   Custom Domain     │         │     VPS/Cloud        │
│  (Cloudflare DNS)   │         │                      │
└──────────┬──────────┘         │  ┌────────────────┐  │
           │                    │  │   PostgreSQL   │  │
           │                    │  │    Container   │  │
    ┌──────▼──────────┐         │  └───────▲────────┘  │
    │ Cloudflare Pages│         │          │           │
    │   (Frontend)    │◄────────┼──────────┼──────────-┤
    └──────────────────┘  HTTPS │  ┌───────▼────────┐  │
                               │  │  NestJS API    │   │
                               │  │   Container    │   │
                               │  └────────────────┘   │
                               └─────────────────────-─┘
```

### Container-Architektur

```yaml
services:
  backend:
    - NestJS Application
    - JWT Authentication
    - Prisma ORM
    - Winston Logging

  database:
    - PostgreSQL 17
    - Persistent Volume
    - Automated Backups

  reverse-proxy (optional):
    - Traefik/Nginx
    - SSL Termination
    - Rate Limiting
```

---

## Deployment-Strategie

### Backend Deployment (VPS/Container)

#### Docker Compose Konfiguration

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: worktime
      POSTGRES_USER: worktime_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U worktime_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    image: ${REGISTRY}/worktime-backend:${VERSION:-latest}
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://worktime_user:${DB_PASSWORD}@postgres:5432/worktime
      JWT_SECRET: ${JWT_SECRET}
      NODE_ENV: production
      CORS_ORIGIN: ${FRONTEND_URL}
    ports:
      - "3000:3000"
    volumes:
      - ./uploads:/app/uploads
    restart: unless-stopped

volumes:
  postgres_data:
```

### Frontend Deployment (Cloudflare Pages)

Das Frontend wird über Cloudflare Pages deployed. Die spezifische Build-Konfiguration (Vite, Webpack, etc.) wird je nach gewähltem Framework und aktuellen Requirements angepasst.

**Key Requirements:**
- Output Directory für Static Files
- Environment Variables für API URL
- Production-optimierte Builds

---

## Datenbank-Design

### Prisma Schema Definition

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String        @id @default(cuid())
  username     String        @unique @db.VarChar(50)
  email        String        @unique @db.VarChar(255)
  passwordHash String        @map("password_hash")
  createdAt    DateTime      @default(now()) @map("created_at")
  updatedAt    DateTime      @updatedAt @map("updated_at")
  
  settings     UserSettings?
  timeEntries  TimeEntry[]
  importLogs   ImportLog[]
  
  @@map("users")
}

model UserSettings {
  id               String   @id @default(cuid())
  userId           String   @unique @map("user_id")
  weeklyHours      Decimal  @default(40) @map("weekly_hours") @db.Decimal(4, 2)
  workDays         Int[]    @default([1, 2, 3, 4, 5]) @map("work_days")
  defaultStartTime DateTime @default(dbgenerated("'09:00'::time")) @map("default_start_time") @db.Time
  defaultEndTime   DateTime @default(dbgenerated("'17:00'::time")) @map("default_end_time") @db.Time
  timezone         String   @default("Europe/Berlin") @db.VarChar(50)
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("user_settings")
}

enum EntryType {
  WORK
  VACATION
  SICK
  HOLIDAY
  
  @@map("entry_type")
}

model TimeEntry {
  id              String    @id @default(cuid())
  userId          String    @map("user_id")
  timingId        String?   @unique @map("timing_id") @db.VarChar(255)
  date            DateTime  @db.Date
  startTime       DateTime? @map("start_time") @db.Time
  endTime         DateTime? @map("end_time") @db.Time
  duration        Decimal   @db.Decimal(5, 2)
  type            EntryType @default(WORK)
  billable        Boolean   @default(true)
  projectName     String?   @map("project_name")
  activityTitle   String?   @map("activity_title")
  notes           String?
  rawProjectPath  String?   @map("raw_project_path")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([userId, date, timingId])
  @@index([userId, date(sort: Desc)])
  @@index([userId, type])
  @@map("time_entries")
}

enum ImportStatus {
  SUCCESS
  PARTIAL
  FAILED
  
  @@map("import_status")
}

model ImportLog {
  id               String       @id @default(cuid())
  userId           String       @map("user_id")
  fileName         String       @map("file_name") @db.VarChar(255)
  fileHash         String?      @map("file_hash") @db.VarChar(64)
  importDate       DateTime     @default(now()) @map("import_date")
  affectedDates    DateTime[]   @map("affected_dates") @db.Date
  replacedEntries  Int          @default(0) @map("replaced_entries")
  newEntries       Int          @default(0) @map("new_entries")
  skippedEntries   Int          @default(0) @map("skipped_entries")
  status           ImportStatus
  errorMessage     String?      @map("error_message")
  metadata         Json?
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId, importDate(sort: Desc)])
  @@map("import_logs")
}
```

### Datenbank-Views (manuell oder via Migration)

```sql
-- Materialized View für Performance (optional)
CREATE MATERIALIZED VIEW weekly_overtime_summary AS
SELECT
  user_id,
  DATE_TRUNC('week', date) as week_start,
  SUM(duration) as total_hours,
  COUNT(DISTINCT date) as work_days,
  SUM(CASE WHEN billable THEN duration ELSE 0 END) as billable_hours
FROM time_entries
WHERE type = 'WORK'
GROUP BY user_id, DATE_TRUNC('week', date);

CREATE UNIQUE INDEX ON weekly_overtime_summary(user_id, week_start);
```

---

## Import-Strategie

### Timing JSON Verarbeitung

#### Import-Pipeline

```typescript
// import.service.ts
import { PrismaService } from '@nestjs/prisma';

class ImportService {
  constructor(private prisma: PrismaService) {}
  
  async processTimingExport(file: Express.Multer.File, userId: string) {
    // 1. Validierung
    const entries = await this.validateAndParseJSON(file);

    // 2. Duplikat-Analyse
    const analysis = await this.analyzeImport(entries, userId);

    // 3. Preview generieren
    const preview = {
      affectedDates: analysis.dates,
      newEntries: analysis.new,
      replacedEntries: analysis.toReplace,
      warnings: analysis.warnings
    };

    // 4. Transaction-basierter Import
    await this.prisma.$transaction(async (tx) => {
      // Alte Einträge für betroffene Tage löschen
      await tx.timeEntry.deleteMany({
        where: {
          userId,
          date: {
            in: analysis.dates
          }
        }
      });

      // Neue Einträge einfügen
      await tx.timeEntry.createMany({
        data: analysis.transformedEntries
      });

      // Import-Log erstellen
      await tx.importLog.create({
        data: {
          userId,
          fileName: file.originalname,
          fileHash: analysis.fileHash,
          affectedDates: analysis.dates,
          newEntries: analysis.new,
          replacedEntries: analysis.toReplace,
          status: 'SUCCESS'
        }
      });
    });

    return preview;
  }

  private parseTimingEntry(entry: TimingExport): Partial<TimeEntry> {
    return {
      timingId: entry.id,
      date: new Date(entry.startDate),
      startTime: this.extractTime(entry.startDate),
      endTime: this.extractTime(entry.endDate),
      duration: this.parseDuration(entry.duration),
      type: this.detectType(entry.project),
      billable: this.isBillable(entry.project),
      projectName: this.extractProjectName(entry.project),
      activityTitle: entry.activityTitle,
      notes: entry.notes,
      rawProjectPath: entry.project
    };
  }

  private detectType(projectPath: string): TimeEntryType {
    if (projectPath.includes('Krankheit')) return 'SICK';
    if (projectPath.includes('Urlaub')) return 'VACATION';
    if (projectPath.includes('Feiertag')) return 'HOLIDAY';
    return 'WORK';
  }
}
```

---

## Sicherheitskonzept

### Authentication & Authorization

#### JWT-Strategie

```typescript
// auth.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      username: payload.username
    };
  }
}

// JWT Configuration
const jwtConfig = {
  secret: process.env.JWT_SECRET,
  signOptions: {
    expiresIn: '30d' // Lange Gültigkeit für Single-User
  },
};
```

### API-Sicherheit

```typescript
// main.ts Security Setup
app.use(helmet());
app.enableCors({
  origin: process.env.FRONTEND_URL || 'https://worktime.yourdomain.com',
  credentials: true,
});

// Rate Limiting (sanft für Single-User)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Minuten
    max: 100, // 100 Requests pro Fenster
    message: 'Too many requests',
  }),
);

// File Upload Limits
app.use(
  fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    abortOnLimit: true,
  }),
);
```

---

## Performance-Optimierungen

### Caching-Strategie

```typescript
// cache.service.ts
@Injectable()
export class CacheService {
  private cache = new Map<string, CachedResult>();

  async getOvertimeBalance(userId: string): Promise<OvertimeBalance> {
    const cacheKey = `overtime:${userId}`;
    const cached = this.cache.get(cacheKey);

    if (cached && !this.isExpired(cached)) {
      return cached.data;
    }

    const balance = await this.calculateBalance(userId);
    this.cache.set(cacheKey, {
      data: balance,
      timestamp: Date.now(),
      ttl: 300000 // 5 Minuten
    });

    return balance;
  }

  invalidateUserCache(userId: string) {
    // Nach Import oder Änderung
    const pattern = new RegExp(`^.*:${userId}$`);
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }
}
```

### Query-Optimierungen

```typescript
// statistics.service.ts
async getWeeklyStatistics(userId: string, year: number, week: number) {
  // Nutze Materialized View wenn vorhanden
  const result = await this.db.query(`
    SELECT
      ws.*,
      us.weekly_hours as target_hours
    FROM weekly_overtime_summary ws
    JOIN user_settings us ON us.user_id = ws.user_id
    WHERE ws.user_id = $1
      AND EXTRACT(YEAR FROM ws.week_start) = $2
      AND EXTRACT(WEEK FROM ws.week_start) = $3
  `, [userId, year, week]);

  return this.formatWeeklyStats(result[0]);
}
```

---

## Monitoring & Logging

### Logging-Konfiguration

```typescript
// logger.config.ts
import * as winston from 'winston';

export const loggerConfig = {
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
};
```

### Health Checks

```typescript
// health.controller.ts
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => ({
        api: {
          status: 'up',
          version: process.env.npm_package_version,
          timestamp: new Date().toISOString(),
        },
      }),
    ]);
  }
}
```

---

## Backup-Strategie

### Automatisierte Backups

```bash
#!/bin/bash
# backup.sh - Läuft als Cron Job

BACKUP_DIR="/backups"
DB_NAME="worktime"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Datenbank-Backup
docker exec postgres pg_dump -U worktime_user $DB_NAME > "$BACKUP_DIR/db_$TIMESTAMP.sql"

# Komprimieren
gzip "$BACKUP_DIR/db_$TIMESTAMP.sql"

# Alte Backups löschen (älter als 30 Tage)
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

# Optional: Upload zu S3/B2
# aws s3 cp "$BACKUP_DIR/db_$TIMESTAMP.sql.gz" s3://backup-bucket/
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to VPS

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run lint

  build-and-deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      # Build Backend Docker Image
      - name: Build and Push Backend
        run: |
          docker build -t worktime-backend ./backend
          docker tag worktime-backend:latest ${{ secrets.REGISTRY }}/worktime-backend:latest
          docker push ${{ secrets.REGISTRY }}/worktime-backend:latest

      # Deploy to VPS
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v0.1.5
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /app/worktime
            docker-compose pull
            docker-compose up -d --no-deps backend
            docker system prune -f

      # Deploy Frontend to Cloudflare Pages
      - name: Deploy Frontend
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: worktime-frontend
          directory: ./frontend/dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

---

## Migrations-Strategie

### TypeORM Migrations

```typescript
// migration/1234567890-InitialSchema.ts
export class InitialSchema1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Schema creation
    await queryRunner.query(`CREATE TABLE users ...`);
    await queryRunner.query(`CREATE TABLE time_entries ...`);

    // Initial data
    await queryRunner.query(`
      INSERT INTO users (username, email, password_hash)
      VALUES ('admin', 'admin@local', '$2b$10...')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS time_entries`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
```

---

## Disaster Recovery

### Recovery Point Objective (RPO): 24 Stunden
### Recovery Time Objective (RTO): 4 Stunden

#### Disaster Recovery Plan

1. **Datenbank-Wiederherstellung**
   ```bash
   docker-compose down
   docker-compose up -d postgres
   docker exec -i postgres psql -U worktime_user worktime < backup.sql
   docker-compose up -d
   ```

2. **Vollständige Wiederherstellung**
   ```bash
   # Neuer VPS
   git clone https://github.com/user/worktime.git
   cd worktime
   cp .env.backup .env
   docker-compose up -d
   # Restore database from backup
   ```

---

## Kosten-Analyse

### Geschätzte monatliche Kosten

| Komponente | Anbieter | Kosten/Monat |
|------------|----------|--------------|
| VPS (2GB RAM, 2 vCPU) | Hetzner/DigitalOcean | ~6-10€ |
| Cloudflare Pages | Cloudflare | 0€ (Free Tier) |
| Domain | Verschiedene | ~1€ |
| Backup Storage (Optional) | Backblaze B2 | ~1€ |
| **Gesamt** | | **~8-12€** |

---

## Technische Schulden & Zukunft

### Bekannte Einschränkungen

1. **Single-User Design**: Multi-User würde größere Refactorings erfordern
2. **Keine Real-Time Updates**: Bei Multi-Device-Nutzung keine Sync
3. **Begrenzte Offline-Fähigkeit**: Requires Internet connection

### Zukunfts-Erweiterungen

1. **PWA-Support**: Offline-Fähigkeit und Mobile App Experience
2. **Timing API Integration**: Automatischer Import wenn API verfügbar
3. **Multi-Device Sync**: WebSocket-basierte Echtzeit-Synchronisation
4. **Machine Learning**: Intelligente Überstunden-Prognosen

---

## Anhang A: Environment Variables

```bash
# .env.example
# Database
DATABASE_URL=postgresql://worktime_user:password@localhost:5432/worktime
DB_PASSWORD=secure_password_here

# Authentication
JWT_SECRET=very_long_random_string_here
BCRYPT_ROUNDS=10

# Application
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://worktime.yourdomain.com

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=/app/logs

# Optional
SENTRY_DSN=
REDIS_URL=
```

---

## Anhang B: API-Dokumentation

Die vollständige API-Dokumentation wird automatisch via OpenAPI/Swagger generiert und ist verfügbar unter:
- Development: `http://localhost:3000/api/docs`
- Production: `https://api.worktime.yourdomain.com/docs`

---

*Dieses Dokument ergänzt das PRD um technische Implementierungsdetails und sollte während der Entwicklung kontinuierlich aktualisiert werden.*

---

**Status**: Architekt-Review abgeschlossen ✅
**Nächster Schritt**: Implementation Phase 1 (MVP)
