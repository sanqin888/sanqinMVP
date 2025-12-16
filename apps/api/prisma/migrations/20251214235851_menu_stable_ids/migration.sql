/*
  Warnings:

  - A unique constraint covering the columns `[stableId]` on the table `MenuCategory` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stableId]` on the table `MenuOptionGroupTemplate` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stableId]` on the table `MenuOptionTemplateChoice` will be added. If there are existing duplicate values, this will fail.
  - The required column `stableId` was added to the `MenuCategory` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `stableId` was added to the `MenuOptionGroupTemplate` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `stableId` was added to the `MenuOptionTemplateChoice` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "MenuCategory" ADD COLUMN     "stableId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "MenuOptionGroupTemplate" ADD COLUMN     "stableId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "MenuOptionTemplateChoice" ADD COLUMN     "stableId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_stableId_key" ON "MenuCategory"("stableId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuOptionGroupTemplate_stableId_key" ON "MenuOptionGroupTemplate"("stableId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuOptionTemplateChoice_stableId_key" ON "MenuOptionTemplateChoice"("stableId");
