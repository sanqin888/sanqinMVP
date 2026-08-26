-- CreateEnum
CREATE TYPE "LoyaltyTenderReservationStatus" AS ENUM ('HELD', 'COMMITTED', 'RELEASED');

-- CreateEnum
CREATE TYPE "PaymentCheckoutAttemptStatus" AS ENUM ('PREPARING', 'PREPARED', 'PROCESSING', 'SUCCEEDED', 'DECLINED', 'CANCELLED', 'UNKNOWN', 'RECONCILING', 'FINALIZING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentBreakdownJson" JSONB;

-- AlterTable
ALTER TABLE "Coupon"
ADD COLUMN "reservedAt" TIMESTAMP(3),
ADD COLUMN "reservationAttemptId" TEXT,
ADD COLUMN "reservationExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserCoupon"
ADD COLUMN "reservationAttemptId" TEXT,
ADD COLUMN "reservationExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LoyaltyTenderReservation" (
    "id" UUID NOT NULL,
    "attemptId" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "pointsMicro" BIGINT NOT NULL DEFAULT 0,
    "pointsValueCents" INTEGER NOT NULL DEFAULT 0,
    "balanceMicro" BIGINT NOT NULL DEFAULT 0,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "status" "LoyaltyTenderReservationStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "orderId" UUID,
    "committedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyTenderReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCheckoutAttempt" (
    "id" UUID NOT NULL,
    "attemptId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "source" "PaymentSource" NOT NULL,
    "storeId" TEXT NOT NULL,
    "paymentMethod" "PaymentTransactionMethod" NOT NULL,
    "currency" TEXT NOT NULL,
    "orderDraftJson" JSONB NOT NULL,
    "pricingSnapshotJson" JSONB NOT NULL,
    "tenderAllocationJson" JSONB NOT NULL,
    "externalAmountCents" INTEGER NOT NULL,
    "status" "PaymentCheckoutAttemptStatus" NOT NULL DEFAULT 'PREPARING',
    "paymentTransactionId" UUID,
    "plannedOrderId" UUID NOT NULL,
    "orderId" UUID,
    "orderStableId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCheckoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Coupon_reservationAttemptId_idx" ON "Coupon"("reservationAttemptId");

-- CreateIndex
CREATE INDEX "UserCoupon_reservationAttemptId_idx" ON "UserCoupon"("reservationAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyTenderReservation_attemptId_key" ON "LoyaltyTenderReservation"("attemptId");

-- CreateIndex
CREATE INDEX "LoyaltyTenderReservation_accountId_status_idx" ON "LoyaltyTenderReservation"("accountId", "status");

-- CreateIndex
CREATE INDEX "LoyaltyTenderReservation_userId_status_idx" ON "LoyaltyTenderReservation"("userId", "status");

-- CreateIndex
CREATE INDEX "LoyaltyTenderReservation_status_expiresAt_idx" ON "LoyaltyTenderReservation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckoutAttempt_attemptId_key" ON "PaymentCheckoutAttempt"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckoutAttempt_idempotencyKey_key" ON "PaymentCheckoutAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckoutAttempt_paymentTransactionId_key" ON "PaymentCheckoutAttempt"("paymentTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckoutAttempt_plannedOrderId_key" ON "PaymentCheckoutAttempt"("plannedOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCheckoutAttempt_orderStableId_key" ON "PaymentCheckoutAttempt"("orderStableId");

-- CreateIndex
CREATE INDEX "PaymentCheckoutAttempt_storeId_status_idx" ON "PaymentCheckoutAttempt"("storeId", "status");

-- CreateIndex
CREATE INDEX "PaymentCheckoutAttempt_status_expiresAt_idx" ON "PaymentCheckoutAttempt"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "PaymentCheckoutAttempt_orderId_idx" ON "PaymentCheckoutAttempt"("orderId");

-- AddForeignKey
ALTER TABLE "LoyaltyTenderReservation" ADD CONSTRAINT "LoyaltyTenderReservation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
