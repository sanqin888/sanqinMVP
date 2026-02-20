-- CreateEnum
CREATE TYPE "AccountingTxType" AS ENUM ('INCOME', 'EXPENSE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AccountingSourceType" AS ENUM ('ORDER', 'MANUAL', 'UBER', 'FANTUAN', 'OTHER');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ACCOUNTANT';

-- CreateTable
CREATE TABLE "AccountingCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountingTxType" NOT NULL,
    "parentId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingTransaction" (
    "id" UUID NOT NULL,
    "txStableId" TEXT NOT NULL,
    "type" "AccountingTxType" NOT NULL,
    "source" "AccountingSourceType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "categoryId" UUID NOT NULL,
    "orderId" TEXT,
    "counterparty" TEXT,
    "memo" TEXT,
    "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AccountingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingAuditLog" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "operatorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingCategory_parentId_idx" ON "AccountingCategory"("parentId");

-- CreateIndex
CREATE INDEX "AccountingCategory_type_isActive_sortOrder_idx" ON "AccountingCategory"("type", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingCategory_name_type_key" ON "AccountingCategory"("name", "type");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingTransaction_txStableId_key" ON "AccountingTransaction"("txStableId");

-- CreateIndex
CREATE INDEX "AccountingTransaction_occurredAt_idx" ON "AccountingTransaction"("occurredAt");

-- CreateIndex
CREATE INDEX "AccountingTransaction_categoryId_occurredAt_idx" ON "AccountingTransaction"("categoryId", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountingTransaction_source_occurredAt_idx" ON "AccountingTransaction"("source", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountingTransaction_deletedAt_idx" ON "AccountingTransaction"("deletedAt");

-- CreateIndex
CREATE INDEX "AccountingAuditLog_entityType_entityId_createdAt_idx" ON "AccountingAuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountingAuditLog_operatorUserId_createdAt_idx" ON "AccountingAuditLog"("operatorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountingCategory" ADD CONSTRAINT "AccountingCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccountingCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingTransaction" ADD CONSTRAINT "AccountingTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AccountingCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
