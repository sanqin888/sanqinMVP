/*
  Warnings:

  - The values [earn,burn,adjust] on the enum `LoyaltyEntryType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
ALTER TABLE "LoyaltyLedger"
  ALTER COLUMN "type" TYPE TEXT
  USING "type"::text;

UPDATE "LoyaltyLedger"
SET "type" = CASE "type"
  WHEN 'earn' THEN 'EARN_ON_PURCHASE'
  WHEN 'burn' THEN 'REDEEM'
  WHEN 'adjust' THEN 'ADJUST_MANUAL'
  ELSE "type"
END;

DROP TYPE "LoyaltyEntryType";
CREATE TYPE "LoyaltyEntryType" AS ENUM ('EARN_ON_PURCHASE', 'ADJUST_MANUAL', 'REDEEM');

ALTER TABLE "LoyaltyLedger"
  ALTER COLUMN "type" TYPE "LoyaltyEntryType"
  USING "type"::"LoyaltyEntryType";
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."LoyaltyLedger" DROP CONSTRAINT "LoyaltyLedger_accountId_fkey";

-- DropIndex
DROP INDEX "public"."LoyaltyAccount_userId_idx";

-- DropIndex
DROP INDEX "public"."LoyaltyLedger_accountId_createdAt_idx";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- AddForeignKey
ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
