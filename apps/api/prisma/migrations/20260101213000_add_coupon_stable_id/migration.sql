ALTER TABLE "Coupon" ADD COLUMN "couponStableId" TEXT;

UPDATE "Coupon"
SET "couponStableId" = 'c' || substring(md5(id), 1, 23)
WHERE "couponStableId" IS NULL;

ALTER TABLE "Coupon" ALTER COLUMN "couponStableId" SET NOT NULL;

CREATE UNIQUE INDEX "Coupon_couponStableId_key" ON "Coupon"("couponStableId");
