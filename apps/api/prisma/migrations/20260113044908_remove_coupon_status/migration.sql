/*
  Warnings:

  - You are about to drop the column `status` on the `CouponTemplate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CouponTemplate" DROP COLUMN "status",
ADD COLUMN     "stackingPolicy" "CouponStackingPolicy" NOT NULL DEFAULT 'EXCLUSIVE';

-- DropEnum
DROP TYPE "CouponTemplateStatus";
