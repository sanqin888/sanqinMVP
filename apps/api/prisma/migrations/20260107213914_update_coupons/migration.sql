-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "fromTemplateId" UUID,
ADD COLUMN     "isFrozen" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CouponTemplate" ADD COLUMN     "description" TEXT,
ADD COLUMN     "title" TEXT;
