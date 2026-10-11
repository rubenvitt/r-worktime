-- CreateEnum
CREATE TYPE "AbsenceSource" AS ENUM ('TIMEWARP', 'MANUAL');

-- CreateEnum
CREATE TYPE "AbsenceKind" AS ENUM ('VACATION', 'RESIDUAL_VACATION', 'SPECIAL_LEAVE', 'EDUCATIONAL_LEAVE', 'OVERTIME_REDUCTION', 'UNPAID_LEAVE', 'PARENTAL_LEAVE', 'MATERNITY_LEAVE', 'SABBATICAL');

-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterEnum
ALTER TYPE "EntrySource" ADD VALUE 'TIMEWARP';

-- AlterEnum (PostgreSQL ≥ 12: ADD VALUE in einer Transaktion erlaubt,
-- solange die neuen Werte hier nicht verwendet werden)
ALTER TYPE "EntryType" ADD VALUE 'OVERTIME_REDUCTION';
ALTER TYPE "EntryType" ADD VALUE 'UNPAID_LEAVE';

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "absenceId" TEXT;

-- CreateTable
CREATE TABLE "calendar_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feedUrlEnc" TEXT,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "writeToTiming" BOOLEAN NOT NULL DEFAULT true,
    "timingProjectId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "lastSyncStats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "AbsenceSource" NOT NULL,
    "externalUid" TEXT,
    "kind" "AbsenceKind" NOT NULL,
    "rawType" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "halfDay" BOOLEAN NOT NULL DEFAULT false,
    "status" "AbsenceStatus" NOT NULL,
    "sequence" INTEGER,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_sync_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "error" TEXT,
    "actions" JSONB NOT NULL,

    CONSTRAINT "absence_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_integrations_userId_key" ON "calendar_integrations"("userId");

-- CreateIndex
CREATE INDEX "absences_userId_startDate_idx" ON "absences"("userId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "absences_userId_externalUid_key" ON "absences"("userId", "externalUid");

-- CreateIndex
CREATE INDEX "absence_sync_logs_userId_startedAt_idx" ON "absence_sync_logs"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "time_entries_absenceId_idx" ON "time_entries"("absenceId");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_absenceId_fkey" FOREIGN KEY ("absenceId") REFERENCES "absences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_integrations" ADD CONSTRAINT "calendar_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_sync_logs" ADD CONSTRAINT "absence_sync_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
