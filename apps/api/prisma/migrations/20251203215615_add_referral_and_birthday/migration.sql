-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LoyaltyEntryType" ADD VALUE 'REFERRAL_BONUS';
ALTER TYPE "LoyaltyEntryType" ADD VALUE 'REFUND_REVERSE_REFERRAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "birthdayDay" INTEGER,
ADD COLUMN     "birthdayMonth" INTEGER,
ADD COLUMN     "referredByUserId" TEXT;

-- CreateIndex
CREATE INDEX "User_referredByUserId_idx" ON "User"("referredByUserId");
