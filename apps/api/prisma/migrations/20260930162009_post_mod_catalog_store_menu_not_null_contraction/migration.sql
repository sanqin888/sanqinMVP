/*
  Warnings:

  - Made the column `storeStableId` on table `MenuCategory` required. This step will fail if there are existing NULL values in that column.
  - Made the column `storeStableId` on table `MenuOptionGroupTemplate` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "MenuCategory" ALTER COLUMN "storeStableId" SET NOT NULL;

-- AlterTable
ALTER TABLE "MenuOptionGroupTemplate" ALTER COLUMN "storeStableId" SET NOT NULL;
