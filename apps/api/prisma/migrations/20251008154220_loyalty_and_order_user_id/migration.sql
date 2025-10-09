/*
  Warnings:

  - The values [earn,burn,adjust] on the enum `LoyaltyEntryType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "LoyaltyEntryType_new" AS ENUM ('EARN_ON_PURCHASE', 'ADJUST_MANUAL', 'REDEEM');
ALTER TABLE "LoyaltyLedger" ALTER COLUMN "type" TYPE "LoyaltyEntryType_new" USING ("type"::text::"LoyaltyEntryType_new");
ALTER TYPE "LoyaltyEntryType" RENAME TO "LoyaltyEntryType_old";
ALTER TYPE "LoyaltyEntryType_new" RENAME TO "LoyaltyEntryType";
DROP TYPE "public"."LoyaltyEntryType_old";
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
