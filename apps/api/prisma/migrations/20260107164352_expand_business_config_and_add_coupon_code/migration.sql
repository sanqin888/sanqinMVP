/*
  Warnings:

  - A unique constraint covering the columns `[promoCode]` on the table `CouponProgram` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CouponDistributionType" AS ENUM ('AUTOMATIC_TRIGGER', 'MANUAL_CLAIM', 'PROMO_CODE', 'ADMIN_PUSH');

-- AlterTable
ALTER TABLE "CouponProgram" ADD COLUMN     "distributionType" "CouponDistributionType" NOT NULL DEFAULT 'AUTOMATIC_TRIGGER',
ADD COLUMN     "issuedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "perUserLimit" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "promoCode" TEXT,
ADD COLUMN     "totalLimit" INTEGER,
ADD COLUMN     "usedCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "triggerType" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CouponProgram_promoCode_key" ON "CouponProgram"("promoCode");
