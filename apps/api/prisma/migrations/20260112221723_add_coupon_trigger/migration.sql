-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CouponProgramTriggerType" ADD VALUE 'MARKETING_OPT_IN';
ALTER TYPE "CouponProgramTriggerType" ADD VALUE 'BIRTHDAY_MONTH';
ALTER TYPE "CouponProgramTriggerType" ADD VALUE 'TIER_UPGRADE';

-- AlterTable
ALTER TABLE "MenuOptionTemplateChoice" ADD COLUMN     "targetItemStableId" TEXT;
