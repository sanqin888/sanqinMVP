/*
  Warnings:

  - Added the required column `paidAt` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentMethod` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL;
