# Coding Standards - r-worktime

## Übersicht
Diese Coding Standards sind speziell für AI-Agents und Entwickler optimiert, um konsistenten, wartbaren Code zu produzieren.

## 🎯 Kritische Regeln (MUST FOLLOW)

### 1. Type Safety First
- **NIEMALS `any` verwenden** - Immer explizite Typen oder `unknown` nutzen
- **Alle API Responses typisieren** - Nutze generierte Types aus OpenAPI
- **Strict Mode aktiviert** - TypeScript strict mode ist Pflicht

### 2. Datenfluss-Regeln
- **Shared Types verwenden** - Alle geteilten Typen kommen aus `packages/shared/types`
- **Keine direkten API Calls** - Immer über Service Layer (`services/`)
- **Environment Variables** - Nur über Config-Objekte, nie `process.env` direkt

### 3. Error Handling
- **Einheitliche Error Response** - Alle APIs nutzen `ApiError` Format
- **Try-Catch in async Functions** - Keine unbehandelten Promise Rejections
- **Logging bei Errors** - Jeder Error wird geloggt mit Context

### 4. State Management
- **Immutable Updates** - State niemals direkt mutieren
- **Single Source of Truth** - Ein State für eine Information
- **Optimistic Updates** - UI Updates vor Server-Bestätigung mit Rollback

## 📁 Projekt-Struktur Konventionen

### Frontend (apps/web)
```typescript
// ✅ RICHTIG - Component mit Props Interface
interface UserCardProps {
  user: User;
  onUpdate: (user: User) => void;
}

export function UserCard({ user, onUpdate }: UserCardProps) {
  // Component logic
}

// ❌ FALSCH - Keine Typen
export function UserCard(props) {
  // Component logic
}
```

### Backend (apps/api)
```typescript
// ✅ RICHTIG - Service mit Dependency Injection
@Injectable()
export class OvertimeService {
  constructor(private prisma: PrismaService) {}
  
  async calculateOvertime(userId: string): Promise<OvertimeBalance> {
    // Implementation
  }
}

// ❌ FALSCH - Direkte DB Calls im Controller
@Controller()
export class OvertimeController {
  @Get()
  async getOvertime() {
    // Kein direkter Prisma Zugriff hier!
  }
}
```

## 🏗️ Architecture Patterns

### 1. Repository Pattern (Backend)
```typescript
// repositories/time-entry.repository.ts
export class TimeEntryRepository {
  async findByUserAndDateRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<TimeEntry[]> {
    return this.prisma.timeEntry.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate
        }
      }
    });
  }
}
```

### 2. Custom Hooks (Frontend)
```typescript
// hooks/use-overtime.ts
export function useOvertime(userId: string) {
  return useQuery({
    queryKey: ['overtime', userId],
    queryFn: () => overtimeService.getBalance(userId),
    staleTime: 5 * 60 * 1000, // 5 Minuten
  });
}
```

### 3. DTO Validation (Backend)
```typescript
// dto/upload-timing.dto.ts
import { IsArray, ValidateNested, IsDateString } from 'class-validator';

export class TimingEntryDto {
  @IsDateString()
  startDate: string;
  
  @IsDateString()
  endDate: string;
  
  @IsString()
  duration: string;
}
```

## 🔄 Import/Export Konventionen

### Import Order
1. Node modules
2. Framework modules  
3. Shared packages
4. Local modules
5. Types/Interfaces
6. Styles

```typescript
// ✅ RICHTIG
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@r-worktime/shared/types';
import { OvertimeService } from '@/services/overtime';
import type { OvertimeBalance } from '@/types';
import styles from './Dashboard.module.css';
```

### Barrel Exports
```typescript
// ✅ RICHTIG - index.ts für public API
export { TimeEntryService } from './time-entry.service';
export { OvertimeService } from './overtime.service';
export type { ServiceOptions } from './types';
```

## 🎨 Naming Conventions

### TypeScript/JavaScript
| Element | Convention | Beispiel |
|---------|------------|----------|
| Components | PascalCase | `UserDashboard.tsx` |
| Hooks | camelCase mit 'use' | `useOvertime.ts` |
| Services | PascalCase + 'Service' | `OvertimeService.ts` |
| Utils | camelCase | `calculateDuration.ts` |
| Types/Interfaces | PascalCase | `TimeEntry`, `User` |
| Enums | PascalCase | `EntryType.WORK` |
| Constants | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |

### API Endpoints
| Method | Pattern | Beispiel |
|--------|---------|----------|
| GET (List) | `/api/resources` | `/api/time-entries` |
| GET (Single) | `/api/resources/:id` | `/api/time-entries/123` |
| POST | `/api/resources` | `/api/time-entries` |
| PUT/PATCH | `/api/resources/:id` | `/api/time-entries/123` |
| DELETE | `/api/resources/:id` | `/api/time-entries/123` |
| Actions | `/api/resources/:id/action` | `/api/time-entries/upload` |

### Database
| Element | Convention | Beispiel |
|---------|------------|----------|
| Tables | snake_case (plural) | `time_entries` |
| Columns | snake_case | `created_at` |
| Indexes | idx_table_columns | `idx_entries_user_date` |
| Foreign Keys | fk_table_reference | `fk_entries_user` |

## 🔒 Security Standards

### Authentication
```typescript
// ✅ RICHTIG - JWT Token Handling
const token = localStorage.getItem('accessToken');
if (token && !isTokenExpired(token)) {
  headers['Authorization'] = `Bearer ${token}`;
}

// ❌ FALSCH - Token in URL
fetch(`/api/data?token=${token}`);
```

### Input Validation
```typescript
// ✅ RICHTIG - Validiere alle User Inputs
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function uploadFile(file: File) {
  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError('File too large');
  }
  // Process file
}
```

## 🧪 Testing Standards

### Test File Naming
- Unit Tests: `*.spec.ts`
- Integration Tests: `*.integration.spec.ts`
- E2E Tests: `*.e2e.spec.ts`

### Test Structure
```typescript
describe('OvertimeService', () => {
  let service: OvertimeService;
  
  beforeEach(() => {
    service = new OvertimeService(mockPrisma);
  });
  
  describe('calculateOvertime', () => {
    it('should calculate positive overtime correctly', async () => {
      // Arrange
      const userId = 'test-user';
      const expected = 5.5;
      
      // Act
      const result = await service.calculateOvertime(userId);
      
      // Assert
      expect(result.balance).toBe(expected);
    });
  });
});
```

## 📝 Kommentar-Standards

### Code-Kommentare
```typescript
// ✅ RICHTIG - Erklärt WARUM, nicht WAS
// Timing exports können Duplikate enthalten wenn User 
// mehrfach am Tag exportiert - wir nehmen den neuesten
const latestEntry = entries.reduce((latest, current) => 
  current.importDate > latest.importDate ? current : latest
);

// ❌ FALSCH - Offensichtliche Kommentare
// Increment counter
counter++;
```

### JSDoc für öffentliche APIs
```typescript
/**
 * Berechnet Überstunden für einen Zeitraum
 * @param userId - User ID
 * @param startDate - Startdatum (inklusiv)
 * @param endDate - Enddatum (inklusiv)
 * @returns Überstunden-Balance mit Details
 * @throws {ValidationError} Bei ungültigen Datumswerten
 */
export async function calculateOvertimeForPeriod(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<OvertimeBalance> {
  // Implementation
}
```

## 🚀 Performance Guidelines

### Frontend
- **Lazy Loading** für große Components
- **Memoization** für expensive Berechnungen
- **Virtual Scrolling** für lange Listen
- **Image Optimization** mit next/image

### Backend
- **Pagination** für alle List-Endpoints
- **Select specific fields** in Prisma Queries
- **Caching** für häufige Queries
- **Batch Operations** wo möglich

## 🔄 Git Commit Standards

### Commit Message Format
```
type(scope): description

[optional body]

[optional footer]
```

### Types
- `feat`: Neue Features
- `fix`: Bugfixes
- `docs`: Dokumentation
- `style`: Formatting
- `refactor`: Code Refactoring
- `test`: Tests
- `chore`: Maintenance

### Beispiele
```bash
feat(overtime): add weekly overtime calculation
fix(upload): handle duplicate timing entries correctly
docs(api): update overtime endpoint documentation
```

## ⚠️ Häufige Fehler vermeiden

### 1. Async/Await Fehler
```typescript
// ❌ FALSCH - Fehlendes await
const data = fetchData(); // Returns Promise, nicht Data!

// ✅ RICHTIG
const data = await fetchData();
```

### 2. Array Mutation
```typescript
// ❌ FALSCH - Mutiert Original Array
const sorted = items.sort();

// ✅ RICHTIG - Erstellt Kopie
const sorted = [...items].sort();
```

### 3. Optional Chaining Overuse
```typescript
// ❌ FALSCH - Zu defensiv
const name = user?.profile?.name?.toString?.();

// ✅ RICHTIG - Sinnvolle Checks
const name = user?.profile?.name || 'Unknown';
```

## 📚 Weiterführende Ressourcen

- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [React Best Practices](https://react.dev/learn/thinking-in-react)
- [NestJS Best Practices](https://docs.nestjs.com/techniques/performance)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)

---

**Letzte Aktualisierung**: 2025-09-12
**Maintainer**: Winston (System Architect)