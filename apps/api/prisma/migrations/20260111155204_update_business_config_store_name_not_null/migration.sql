/*
  Warnings:

  - Made the column `storeName` on table `BusinessConfig` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "BusinessConfig" ALTER COLUMN "storeName" SET NOT NULL;
