/*
  Warnings:

  - The `userId` column on the `Coupon` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Coupon" DROP COLUMN "userId",
ADD COLUMN     "userId" UUID;

-- CreateIndex
CREATE INDEX "Coupon_userId_expiresAt_idx" ON "Coupon"("userId", "expiresAt");
