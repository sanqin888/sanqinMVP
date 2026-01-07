-- Add coupon template display fields
ALTER TABLE "CouponTemplate"
ADD COLUMN "title" TEXT,
ADD COLUMN "description" TEXT;

-- Add coupon metadata fields
ALTER TABLE "Coupon"
ADD COLUMN "fromTemplateId" UUID,
ADD COLUMN "isFrozen" BOOLEAN NOT NULL DEFAULT false;
