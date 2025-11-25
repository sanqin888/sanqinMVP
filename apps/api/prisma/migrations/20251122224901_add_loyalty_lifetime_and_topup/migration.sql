/*
  Warnings:

  - A unique constraint covering the columns `[clientRequestId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LoyaltyEntryType" ADD VALUE 'TOPUP_PURCHASED';
ALTER TYPE "LoyaltyEntryType" ADD VALUE 'ADJUSTMENT_MANUAL';

-- AlterTable
ALTER TABLE "LoyaltyAccount" ADD COLUMN     "lifetimeSpendCents" INTEGER NOT NULL DEFAULT 0;
