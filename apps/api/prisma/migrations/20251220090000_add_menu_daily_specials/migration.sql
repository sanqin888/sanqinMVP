-- CreateEnum
CREATE TYPE "SpecialPricingMode" AS ENUM ('OVERRIDE_PRICE', 'DISCOUNT_DELTA', 'DISCOUNT_PERCENT');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "baseUnitPriceCents" INTEGER,
ADD COLUMN     "optionsUnitPriceCents" INTEGER,
ADD COLUMN     "isDailySpecialApplied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dailySpecialStableId" TEXT;

-- CreateTable
CREATE TABLE "MenuDailySpecial" (
    "id" SERIAL NOT NULL,
    "stableId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "itemStableId" TEXT NOT NULL,
    "pricingMode" "SpecialPricingMode" NOT NULL,
    "overridePriceCents" INTEGER,
    "discountDeltaCents" INTEGER,
    "discountPercent" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "startMinutes" INTEGER,
    "endMinutes" INTEGER,
    "disallowCoupons" BOOLEAN NOT NULL DEFAULT true,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MenuDailySpecial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuDailySpecial_stableId_key" ON "MenuDailySpecial"("stableId");

-- CreateIndex
CREATE INDEX "MenuDailySpecial_weekday_isEnabled_deletedAt_idx" ON "MenuDailySpecial"("weekday", "isEnabled", "deletedAt");

-- CreateIndex
CREATE INDEX "MenuDailySpecial_itemStableId_idx" ON "MenuDailySpecial"("itemStableId");

-- AddForeignKey
ALTER TABLE "MenuDailySpecial" ADD CONSTRAINT "MenuDailySpecial_itemStableId_fkey" FOREIGN KEY ("itemStableId") REFERENCES "MenuItem"("stableId") ON DELETE RESTRICT ON UPDATE CASCADE;
