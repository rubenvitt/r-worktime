-- Krank-Einträge nach Timing: ab dem Wählen des Krank-Projekts
ALTER TABLE "timing_integrations" ADD COLUMN     "sickSince" TIMESTAMP(3);
-- Schon gewähltes Krank-Projekt: ab jetzt
UPDATE "timing_integrations" SET "sickSince" = NOW() WHERE "sickProjectId" IS NOT NULL;
