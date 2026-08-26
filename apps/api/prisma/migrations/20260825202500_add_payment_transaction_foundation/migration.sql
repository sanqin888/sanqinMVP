-- CreateEnum
CREATE TYPE "PaymentOperation" AS ENUM ('SALE', 'REFUND', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('CREATED', 'PROCESSING', 'SUCCEEDED', 'DECLINED', 'CANCELLED', 'UNKNOWN', 'RECONCILING', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('CLOVER', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('POS_TERMINAL', 'WEB_ECOMMERCE', 'ADMIN', 'PROVIDER_WEBHOOK', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "PaymentTransactionMethod" AS ENUM ('CASH', 'CARD', 'WECHAT_ALIPAY', 'STORE_BALANCE', 'UBEREATS');

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" UUID NOT NULL,
    "attemptId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "orderId" UUID,
    "checkoutIntentId" UUID,
    "provider" "PaymentProvider" NOT NULL,
    "source" "PaymentSource" NOT NULL,
    "paymentMethod" "PaymentTransactionMethod" NOT NULL,
    "operation" "PaymentOperation" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "surchargeCents" INTEGER,
    "chargedTotalCents" INTEGER,
    "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'CREATED',
    "externalPaymentId" TEXT,
    "providerPaymentId" TEXT,
    "providerRefundId" TEXT,
    "providerOrderId" TEXT,
    "resultCode" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "terminalId" TEXT,
    "cardBrand" TEXT,
    "cardLast4" TEXT,
    "processedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_attemptId_key" ON "PaymentTransaction"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_idempotencyKey_key" ON "PaymentTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_provider_externalPaymentId_key" ON "PaymentTransaction"("provider", "externalPaymentId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_orderId_idx" ON "PaymentTransaction"("orderId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_checkoutIntentId_idx" ON "PaymentTransaction"("checkoutIntentId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_provider_providerPaymentId_idx" ON "PaymentTransaction"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_provider_providerRefundId_idx" ON "PaymentTransaction"("provider", "providerRefundId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_updatedAt_idx" ON "PaymentTransaction"("status", "updatedAt");
