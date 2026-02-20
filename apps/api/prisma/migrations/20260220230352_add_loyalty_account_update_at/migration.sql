/*
  Warnings:

  - Added the required column `updatedAt` to the `LoyaltyAccount` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AccountingTransaction" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable (LoyaltyAccount) - safe for non-empty table
ALTER TABLE "LoyaltyAccount"
  ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- backfill existing rows (in case DB stores NULL somehow)
UPDATE "LoyaltyAccount"
SET "updatedAt" = CURRENT_TIMESTAMP
WHERE "updatedAt" IS NULL;

-- make it required
ALTER TABLE "LoyaltyAccount"
  ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" UUID NOT NULL,
    "eventName" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "locale" TEXT,
    "path" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_eventName_occurredAt_idx" ON "AnalyticsEvent"("eventName", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_occurredAt_idx" ON "AnalyticsEvent"("occurredAt");
