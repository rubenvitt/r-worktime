-- Entwürfe im Urlaubsplaner
CREATE TABLE "vacation_drafts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacation_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vacation_drafts_userId_startDate_idx" ON "vacation_drafts"("userId", "startDate");

-- AddForeignKey
ALTER TABLE "vacation_drafts" ADD CONSTRAINT "vacation_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
