-- CreateTable
CREATE TABLE "public"."reviewed_days" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviewed_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviewed_days_userId_date_idx" ON "public"."reviewed_days"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "reviewed_days_userId_date_key" ON "public"."reviewed_days"("userId", "date");

-- AddForeignKey
ALTER TABLE "public"."reviewed_days" ADD CONSTRAINT "reviewed_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
