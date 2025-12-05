-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCodeSnapshot" TEXT,
ADD COLUMN     "couponDiscountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "couponExpiresAt" TIMESTAMP(3),
ADD COLUMN     "couponId" UUID,
ADD COLUMN     "couponMinSpendCents" INTEGER,
ADD COLUMN     "couponTitleSnapshot" TEXT;

-- CreateTable
CREATE TABLE "Coupon" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "minSpendCents" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "orderId" UUID,
    "source" TEXT,
    "campaign" TEXT,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Coupon_userId_expiresAt_idx" ON "Coupon"("userId", "expiresAt");
