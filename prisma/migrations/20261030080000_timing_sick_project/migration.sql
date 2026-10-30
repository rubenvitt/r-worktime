-- Timing-Projekt für „Krank“ aus der Problemliste
ALTER TABLE "timing_integrations" ADD COLUMN     "sickProjectId" TEXT;

-- Von R-Worktime in Timing angelegte Einträge („Krank“): Löschen löscht dort mit
ALTER TABLE "time_entries" ADD COLUMN     "createdInTiming" BOOLEAN NOT NULL DEFAULT false;
