-- CreateEnum
CREATE TYPE "MenuItemVisibility" AS ENUM ('PUBLIC', 'HIDDEN');

-- CreateEnum
CREATE TYPE "CouponStackingPolicy" AS ENUM ('EXCLUSIVE', 'STACKABLE');

-- CreateEnum
CREATE TYPE "UserCouponStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'REDEEMED', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN "visibility" "MenuItemVisibility" NOT NULL DEFAULT 'PUBLIC';

UPDATE "MenuItem"
SET "visibility" =
  CASE
    WHEN "isVisible" IS TRUE THEN 'PUBLIC'::"MenuItemVisibility"
    ELSE 'HIDDEN'::"MenuItemVisibility"
  END;

ALTER TABLE "MenuItem" DROP COLUMN "isVisible";

-- AlterTable
ALTER TABLE "Coupon" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Coupon" ADD COLUMN "unlockedItemStableIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Coupon" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Coupon" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "Coupon" ADD COLUMN "endsAt" TIMESTAMP(3);
ALTER TABLE "Coupon" ADD COLUMN "stackingPolicy" "CouponStackingPolicy" NOT NULL DEFAULT 'EXCLUSIVE';

-- CreateTable
CREATE TABLE "UserCoupon" (
    "id" UUID NOT NULL,
    "userStableId" TEXT NOT NULL,
    "couponStableId" TEXT NOT NULL,
    "status" "UserCouponStatus" NOT NULL DEFAULT 'AVAILABLE',
    "expiresAt" TIMESTAMP(3),
    "reservedAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "orderStableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCoupon_userStableId_couponStableId_key" ON "UserCoupon"("userStableId", "couponStableId");

-- CreateIndex
CREATE INDEX "UserCoupon_userStableId_status_expiresAt_idx" ON "UserCoupon"("userStableId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "UserCoupon_couponStableId_idx" ON "UserCoupon"("couponStableId");

-- AddForeignKey
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_userStableId_fkey" FOREIGN KEY ("userStableId") REFERENCES "User"("userStableId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCoupon" ADD CONSTRAINT "UserCoupon_couponStableId_fkey" FOREIGN KEY ("couponStableId") REFERENCES "Coupon"("couponStableId") ON DELETE CASCADE ON UPDATE CASCADE;
