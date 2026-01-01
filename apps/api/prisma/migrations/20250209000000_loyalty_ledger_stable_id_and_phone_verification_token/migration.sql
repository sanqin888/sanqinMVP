/*
  Warnings:

  - A unique constraint covering the columns `[ledgerStableId]` on the table `LoyaltyLedger` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[token]` on the table `PhoneVerification` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "LoyaltyLedger" ADD COLUMN     "ledgerStableId" TEXT;

-- Backfill stable IDs for existing ledger rows
UPDATE "LoyaltyLedger"
SET "ledgerStableId" = md5(random()::text || clock_timestamp()::text)
WHERE "ledgerStableId" IS NULL;

-- Ensure stable ID is required
ALTER TABLE "LoyaltyLedger" ALTER COLUMN "ledgerStableId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PhoneVerification" ADD COLUMN     "token" TEXT;

-- Backfill tokens for existing phone verification rows (legacy token = id)
UPDATE "PhoneVerification"
SET "token" = md5(random()::text || clock_timestamp()::text)
WHERE "token" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyLedger_ledgerStableId_key" ON "LoyaltyLedger"("ledgerStableId");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneVerification_token_key" ON "PhoneVerification"("token");
