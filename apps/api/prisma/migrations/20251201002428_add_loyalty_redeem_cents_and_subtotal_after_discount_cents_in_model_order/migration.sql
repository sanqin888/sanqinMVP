-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "loyaltyRedeemCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subtotalAfterDiscountCents" INTEGER NOT NULL DEFAULT 0;
