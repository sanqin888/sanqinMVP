/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `AccountingTransaction` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AccountingAccountType" AS ENUM ('CASH', 'BANK', 'PLATFORM_WALLET');

-- CreateEnum
CREATE TYPE "SettlementPlatform" AS ENUM ('UBER_EATS', 'FANTUAN');

-- AlterEnum
ALTER TYPE "AccountingTxType" ADD VALUE 'TRANSFER';

-- AlterTable
ALTER TABLE "AccountingTransaction" ADD COLUMN     "accountId" UUID,
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "toAccountId" UUID;

-- CreateTable
CREATE TABLE "AccountingAccount" (
    "id" UUID NOT NULL,
    "accountStableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountingAccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettlementRecord" (
    "id" UUID NOT NULL,
    "settlementStableId" TEXT NOT NULL,
    "platform" "SettlementPlatform" NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "externalRowId" TEXT,
    "orderId" TEXT,
    "grossCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,
    "payoutAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSettlementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriodClose" (
    "id" UUID NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'MONTH',
    "periodKey" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "closedByUserId" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingPeriodClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAccount_accountStableId_key" ON "AccountingAccount"("accountStableId");

-- CreateIndex
CREATE INDEX "AccountingAccount_type_isActive_idx" ON "AccountingAccount"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAccount_name_type_key" ON "AccountingAccount"("name", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSettlementRecord_settlementStableId_key" ON "PlatformSettlementRecord"("settlementStableId");

-- CreateIndex
CREATE INDEX "PlatformSettlementRecord_platform_payoutAt_idx" ON "PlatformSettlementRecord"("platform", "payoutAt");

-- CreateIndex
CREATE INDEX "PlatformSettlementRecord_orderId_idx" ON "PlatformSettlementRecord"("orderId");

-- CreateIndex
CREATE INDEX "PlatformSettlementRecord_importBatchId_idx" ON "PlatformSettlementRecord"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSettlementRecord_platform_importBatchId_externalRow_key" ON "PlatformSettlementRecord"("platform", "importBatchId", "externalRowId");

-- CreateIndex
CREATE INDEX "AccountingPeriodClose_periodType_closedAt_idx" ON "AccountingPeriodClose"("periodType", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriodClose_periodType_periodKey_key" ON "AccountingPeriodClose"("periodType", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingTransaction_idempotencyKey_key" ON "AccountingTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AccountingTransaction_accountId_occurredAt_idx" ON "AccountingTransaction"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountingTransaction_toAccountId_occurredAt_idx" ON "AccountingTransaction"("toAccountId", "occurredAt");

-- AddForeignKey
ALTER TABLE "AccountingTransaction" ADD CONSTRAINT "AccountingTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingTransaction" ADD CONSTRAINT "AccountingTransaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "AccountingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
