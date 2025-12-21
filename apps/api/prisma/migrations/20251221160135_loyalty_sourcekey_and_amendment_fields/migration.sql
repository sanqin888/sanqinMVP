/*
  Warnings:

  - You are about to drop the column `createdAt` on the `OrderAmendment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[orderId,type,sourceKey]` on the table `LoyaltyLedger` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LoyaltyEntryType" ADD VALUE 'AMEND_RETURN_REDEEM';
ALTER TYPE "LoyaltyEntryType" ADD VALUE 'AMEND_EARN_ADJUST';
ALTER TYPE "LoyaltyEntryType" ADD VALUE 'AMEND_REFERRAL_ADJUST';

-- DropIndex
DROP INDEX "LoyaltyLedger_orderId_type_key";

-- DropIndex
DROP INDEX "OrderAmendment_orderId_createdAt_idx";

-- DropIndex
DROP INDEX "OrderAmendment_rebillGroupId_idx";

-- AlterTable
ALTER TABLE "LoyaltyLedger" ADD COLUMN     "sourceKey" TEXT NOT NULL DEFAULT 'ORDER';

-- AlterTable
ALTER TABLE "OrderAmendment" DROP COLUMN "createdAt",
ADD COLUMN     "earnAdjustMicro" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "redeemReturnCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "redeemReturnMicro" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "referralAdjustMicro" BIGINT NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "LoyaltyLedger_orderId_idx" ON "LoyaltyLedger"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyLedger_orderId_type_sourceKey_key" ON "LoyaltyLedger"("orderId", "type", "sourceKey");

-- CreateIndex
CREATE INDEX "OrderAmendment_orderId_idx" ON "OrderAmendment"("orderId");
