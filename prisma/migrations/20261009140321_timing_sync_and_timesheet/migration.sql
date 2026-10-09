/*
  Warnings:

  - A unique constraint covering the columns `[userId,externalId]` on the table `time_entries` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('MANUAL', 'FILE_IMPORT', 'TIMING_SYNC', 'BULK_FILL', 'HOLIDAY', 'ADJUSTMENT');

-- DropIndex
DROP INDEX "time_entries_userId_date_startTime_key";

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "projectPath" TEXT,
ADD COLUMN     "source" "EntrySource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "title" TEXT;

-- Backfill: Quelle bestehender Einträge ableiten (Reihenfolge egal dank source='MANUAL'-Guard)
UPDATE "time_entries" SET "source" = 'ADJUSTMENT'
WHERE "description" LIKE '%Anfangs-Überstunden-Saldo%';

UPDATE "time_entries" SET "source" = 'HOLIDAY'
WHERE "source" = 'MANUAL' AND "type" = 'HOLIDAY' AND "importLogId" IS NULL;

UPDATE "time_entries" SET "source" = 'FILE_IMPORT'
WHERE "source" = 'MANUAL' AND "importLogId" IS NOT NULL;

-- Altdaten aus dem Datei-Import: Titel = ungeteilte description, notes bleibt NULL
UPDATE "time_entries" SET "title" = "description"
WHERE "source" = 'FILE_IMPORT' AND "title" IS NULL;

-- CreateTable
CREATE TABLE "timing_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiTokenEnc" TEXT,
    "projectRoots" TEXT[] DEFAULT ARRAY['Work']::TEXT[],
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "syncWindowDays" INTEGER NOT NULL DEFAULT 35,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "lastSyncStats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timing_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "timing_integrations_userId_key" ON "timing_integrations"("userId");

-- CreateIndex
CREATE INDEX "time_entries_userId_date_startTime_idx" ON "time_entries"("userId", "date", "startTime");

-- CreateIndex
CREATE INDEX "time_entries_userId_source_idx" ON "time_entries"("userId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_userId_externalId_key" ON "time_entries"("userId", "externalId");

-- AddForeignKey
ALTER TABLE "timing_integrations" ADD CONSTRAINT "timing_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
