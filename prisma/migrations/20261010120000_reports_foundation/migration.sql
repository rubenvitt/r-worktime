-- AlterTable
ALTER TABLE "user_settings" DROP COLUMN "breakDuration",
DROP COLUMN "defaultEndTime",
DROP COLUMN "defaultStartTime",
DROP COLUMN "language",
DROP COLUMN "overtimeNotification",
DROP COLUMN "theme",
DROP COLUMN "timezone",
ADD COLUMN     "annualVacationDays" DECIMAL(4,1) NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "travel_days" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isTravel" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "travel_days_userId_date_idx" ON "travel_days"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "travel_days_userId_date_key" ON "travel_days"("userId", "date");

-- AddForeignKey
ALTER TABLE "travel_days" ADD CONSTRAINT "travel_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
