/*
  Warnings:

  - You are about to drop the column `merchantUberUserId` on the `UberMerchantConnection` table. All the data in the column will be lost.
  - You are about to drop the column `uberUserId` on the `UberOAuthStateRequest` table. All the data in the column will be lost.
  - You are about to drop the column `merchantUberUserId` on the `UberStoreMapping` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[connectionId,uberStoreId]` on the table `UberStoreMapping` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `connectionId` to the `UberStoreMapping` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "UberStoreMapping" DROP CONSTRAINT "UberStoreMapping_merchantUberUserId_fkey";

-- DropIndex
DROP INDEX "UberMerchantConnection_merchantUberUserId_key";

-- DropIndex
DROP INDEX "UberStoreMapping_merchantUberUserId_isProvisioned_idx";

-- DropIndex
DROP INDEX "UberStoreMapping_merchantUberUserId_uberStoreId_key";

-- AlterTable
ALTER TABLE "UberMerchantConnection" DROP COLUMN "merchantUberUserId";

-- AlterTable
ALTER TABLE "UberOAuthStateRequest" DROP COLUMN "uberUserId",
ADD COLUMN     "connectionId" UUID;

-- AlterTable
ALTER TABLE "UberStoreMapping" DROP COLUMN "merchantUberUserId",
ADD COLUMN     "connectionId" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "UberStoreMapping_connectionId_isProvisioned_idx" ON "UberStoreMapping"("connectionId", "isProvisioned");

-- CreateIndex
CREATE UNIQUE INDEX "UberStoreMapping_connectionId_uberStoreId_key" ON "UberStoreMapping"("connectionId", "uberStoreId");

-- AddForeignKey
ALTER TABLE "UberStoreMapping" ADD CONSTRAINT "UberStoreMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "UberMerchantConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
