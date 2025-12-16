/*
  Warnings:

  - You are about to drop the column `productId` on the `OrderItem` table. All the data in the column will be lost.
  - Added the required column `productStableId` to the `OrderItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MenuCategory" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MenuOptionGroupTemplate" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MenuOptionTemplateChoice" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "productId",
ADD COLUMN     "productStableId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "MenuCategory_deletedAt_idx" ON "MenuCategory"("deletedAt");

-- CreateIndex
CREATE INDEX "MenuItem_deletedAt_idx" ON "MenuItem"("deletedAt");

-- CreateIndex
CREATE INDEX "MenuOptionGroupTemplate_deletedAt_idx" ON "MenuOptionGroupTemplate"("deletedAt");

-- CreateIndex
CREATE INDEX "MenuOptionTemplateChoice_deletedAt_idx" ON "MenuOptionTemplateChoice"("deletedAt");
