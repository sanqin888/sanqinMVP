/*
  Warnings:

  - The values [ADJUST_MANUAL,REDEEM] on the enum `LoyaltyEntryType` will be removed. If these variants are still used in the database, this will fail.
  - The primary key for the `LoyaltyAccount` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `LoyaltyLedger` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `orderId` column on the `LoyaltyLedger` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Order` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `userId` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `OrderItem` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `id` on the `LoyaltyAccount` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `LoyaltyLedger` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `accountId` on the `LoyaltyLedger` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Order` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `channel` on the `Order` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `fulfillmentType` on the `Order` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `OrderItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `orderId` on the `OrderItem` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('pickup', 'dine_in');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('web', 'in_store', 'ubereats');

-- AlterEnum
BEGIN;
CREATE TYPE "LoyaltyEntryType_new" AS ENUM ('EARN_ON_PURCHASE', 'REDEEM_ON_ORDER', 'REFUND_REVERSE_EARN', 'REFUND_RETURN_REDEEM');
ALTER TABLE "LoyaltyLedger" ALTER COLUMN "type" TYPE "LoyaltyEntryType_new" USING ("type"::text::"LoyaltyEntryType_new");
ALTER TYPE "LoyaltyEntryType" RENAME TO "LoyaltyEntryType_old";
ALTER TYPE "LoyaltyEntryType_new" RENAME TO "LoyaltyEntryType";
DROP TYPE "public"."LoyaltyEntryType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."LoyaltyLedger" DROP CONSTRAINT "LoyaltyLedger_accountId_fkey";

-- DropForeignKey
ALTER TABLE "public"."OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- AlterTable
ALTER TABLE "LoyaltyAccount" DROP CONSTRAINT "LoyaltyAccount_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ALTER COLUMN "pointsMicro" DROP DEFAULT,
ADD CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "LoyaltyLedger" DROP CONSTRAINT "LoyaltyLedger_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "accountId",
ADD COLUMN     "accountId" UUID NOT NULL,
DROP COLUMN "orderId",
ADD COLUMN     "orderId" UUID,
ADD CONSTRAINT "LoyaltyLedger_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Order" DROP CONSTRAINT "Order_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "channel",
ADD COLUMN     "channel" "Channel" NOT NULL,
DROP COLUMN "fulfillmentType",
ADD COLUMN     "fulfillmentType" "FulfillmentType" NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID,
ADD CONSTRAINT "Order_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "orderId",
ADD COLUMN     "orderId" UUID NOT NULL,
ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "LoyaltyAccount_userId_idx" ON "LoyaltyAccount"("userId");

-- CreateIndex
CREATE INDEX "LoyaltyLedger_accountId_createdAt_idx" ON "LoyaltyLedger"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyLedger_orderId_type_key" ON "LoyaltyLedger"("orderId", "type");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyLedger" ADD CONSTRAINT "LoyaltyLedger_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
