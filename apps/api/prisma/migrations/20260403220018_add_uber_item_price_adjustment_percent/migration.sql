-- AlterTable
ALTER TABLE "UberItemChannelConfig" ADD COLUMN     "isPriceOverridden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceAdjustmentPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;