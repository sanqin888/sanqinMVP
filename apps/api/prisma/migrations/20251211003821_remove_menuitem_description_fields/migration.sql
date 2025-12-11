/*
  Warnings:

  - You are about to drop the column `descriptionEn` on the `MenuItem` table. All the data in the column will be lost.
  - You are about to drop the column `descriptionZh` on the `MenuItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MenuItem" DROP COLUMN "descriptionEn",
DROP COLUMN "descriptionZh";
