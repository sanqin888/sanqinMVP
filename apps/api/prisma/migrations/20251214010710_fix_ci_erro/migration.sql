/*
  Warnings:

  - You are about to drop the column `createdAt` on the `MenuOptionGroupTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `MenuOptionGroupTemplate` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."MenuItem" DROP CONSTRAINT "MenuItem_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "public"."MenuItemOptionGroup" DROP CONSTRAINT "MenuItemOptionGroup_templateGroupId_fkey";

-- AlterTable
ALTER TABLE "MenuItemOptionGroup" ALTER COLUMN "maxSelect" DROP DEFAULT;

-- AlterTable
ALTER TABLE "MenuOptionGroupTemplate" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt";

-- CreateIndex
CREATE INDEX "MenuCategory_sortOrder_idx" ON "MenuCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "MenuItem_categoryId_sortOrder_idx" ON "MenuItem"("categoryId", "sortOrder");

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemOptionGroup" ADD CONSTRAINT "MenuItemOptionGroup_templateGroupId_fkey" FOREIGN KEY ("templateGroupId") REFERENCES "MenuOptionGroupTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
