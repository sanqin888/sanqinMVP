/*
  Warnings:

  - A unique constraint covering the columns `[enrollmentKeyHash]` on the table `PosDevice` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `enrollmentKeyHash` to the `PosDevice` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PosDevice" ADD COLUMN     "enrollmentKeyHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PosDevice_enrollmentKeyHash_key" ON "PosDevice"("enrollmentKeyHash");
