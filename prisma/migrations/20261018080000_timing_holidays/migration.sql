-- Feiertage in Timing eintragen (ab dem Tag des Einschaltens)
ALTER TABLE "timing_integrations" ADD COLUMN     "holidayProjectId" TEXT,
ADD COLUMN     "holidaysSince" DATE,
ADD COLUMN     "writeHolidays" BOOLEAN NOT NULL DEFAULT false;
