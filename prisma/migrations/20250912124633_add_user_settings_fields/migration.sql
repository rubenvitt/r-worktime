-- AlterTable
ALTER TABLE "public"."user_settings" ADD COLUMN     "breakDuration" DECIMAL(3,2) NOT NULL DEFAULT 0.5,
ADD COLUMN     "defaultEndTime" TEXT NOT NULL DEFAULT '17:00',
ADD COLUMN     "defaultStartTime" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
ADD COLUMN     "workDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[];
