/*
  Warnings:

  - Made the column `deliveryFeeCents` on table `Order` required. This step will fail if there are existing NULL values in that column.
  - Made the column `deliveryCostCents` on table `Order` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliverySubsidyCents" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "deliveryFeeCents" SET NOT NULL,
ALTER COLUMN "deliveryFeeCents" SET DEFAULT 0,
ALTER COLUMN "deliveryCostCents" SET NOT NULL,
ALTER COLUMN "deliveryCostCents" SET DEFAULT 0;
