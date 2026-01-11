/*
  Warnings:

  - You are about to drop the column `storeAddress` on the `BusinessConfig` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[storeName]` on the table `BusinessConfig` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "BusinessConfig" DROP COLUMN "storeAddress";

-- CreateIndex
CREATE UNIQUE INDEX "BusinessConfig_storeName_key" ON "BusinessConfig"("storeName");
