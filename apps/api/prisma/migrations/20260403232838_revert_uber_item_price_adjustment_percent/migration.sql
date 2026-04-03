/*
  Warnings:

  - You are about to drop the column `isPriceOverridden` on the `UberItemChannelConfig` table. All the data in the column will be lost.
  - You are about to drop the column `priceAdjustmentPercent` on the `UberItemChannelConfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "UberItemChannelConfig" DROP COLUMN "isPriceOverridden",
DROP COLUMN "priceAdjustmentPercent";
