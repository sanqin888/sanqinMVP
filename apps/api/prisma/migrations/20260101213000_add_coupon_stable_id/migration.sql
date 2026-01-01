ALTER TABLE "Coupon" ADD COLUMN "couponStableId" TEXT NOT NULL;
CREATE UNIQUE INDEX "Coupon_couponStableId_key" ON "Coupon"("couponStableId");
