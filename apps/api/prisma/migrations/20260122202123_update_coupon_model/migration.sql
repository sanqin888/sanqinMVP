/*
  Warnings:

  - You are about to drop the column `name` on the `CouponProgram` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `CouponTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `CouponTemplate` table. All the data in the column will be lost.
  - Added the required column `tittleCh` to the `CouponProgram` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CouponProgram" DROP COLUMN "name",
ADD COLUMN     "tittleCh" TEXT NOT NULL,
ADD COLUMN     "tittleEn" TEXT;

-- AlterTable
ALTER TABLE "CouponTemplate" DROP COLUMN "name",
DROP COLUMN "title",
ADD COLUMN     "tittleCh" TEXT;
