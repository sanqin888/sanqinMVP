-- CreateEnum
CREATE TYPE "AccountingExternalSaleGranularity" AS ENUM ('TRANSACTION', 'DAILY_SUMMARY', 'PERIOD_SUMMARY');

-- AlterEnum
ALTER TYPE "AccountingJournalSource" ADD VALUE 'EXTERNAL_SALE';

-- CreateTable
CREATE TABLE "AccountingExternalSale" (
    "id" UUID NOT NULL,
    "externalSaleStableId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "storeStableId" TEXT NOT NULL,
    "classificationStableId" TEXT NOT NULL,
    "granularity" "AccountingExternalSaleGranularity" NOT NULL,
    "occurredOn" DATE NOT NULL,
    "periodStartOn" DATE,
    "periodEndOn" DATE,
    "counterpartyName" TEXT NOT NULL,
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "factHash" TEXT NOT NULL,
    "journalEntryStableId" TEXT,
    "reversalStableId" TEXT,
    "reversalFactHash" TEXT,
    "reversalJournalEntryStableId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedByActorRef" TEXT,
    "replacementForExternalSaleId" UUID,
    "note" TEXT,
    "createdByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingExternalSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingExternalSaleLine" (
    "id" UUID NOT NULL,
    "lineStableId" TEXT NOT NULL,
    "externalSaleId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "productReference" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "lineAmountCents" INTEGER NOT NULL,
    "revenueAccountId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingExternalSaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingExternalSaleAdjustment" (
    "id" UUID NOT NULL,
    "adjustmentStableId" TEXT NOT NULL,
    "externalSaleId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "revenueAccountId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingExternalSaleAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingExternalSaleTax" (
    "id" UUID NOT NULL,
    "taxStableId" TEXT NOT NULL,
    "externalSaleId" UUID NOT NULL,
    "taxCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rateBasisPoints" INTEGER,
    "amountCents" INTEGER NOT NULL,
    "liabilityAccountId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingExternalSaleTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingExternalSaleSettlement" (
    "id" UUID NOT NULL,
    "settlementStableId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "storeStableId" TEXT NOT NULL,
    "settlementOn" DATE NOT NULL,
    "counterpartyName" TEXT NOT NULL,
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "factHash" TEXT NOT NULL,
    "journalEntryStableId" TEXT,
    "reversalStableId" TEXT,
    "reversalFactHash" TEXT,
    "reversalJournalEntryStableId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedByActorRef" TEXT,
    "replacementForSettlementId" UUID,
    "note" TEXT,
    "createdByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingExternalSaleSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingExternalSaleSettlementAllocation" (
    "id" UUID NOT NULL,
    "allocationStableId" TEXT NOT NULL,
    "settlementId" UUID NOT NULL,
    "externalSaleId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingExternalSaleSettlementAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingExternalSaleSettlementComponent" (
    "id" UUID NOT NULL,
    "componentStableId" TEXT NOT NULL,
    "settlementId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingExternalSaleSettlementComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingExternalSaleEvidence" (
    "id" UUID NOT NULL,
    "evidenceStableId" TEXT NOT NULL,
    "externalSaleId" UUID NOT NULL,
    "artifactId" UUID NOT NULL,
    "linkedByActorRef" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingExternalSaleEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingExternalSaleSettlementEvidence" (
    "id" UUID NOT NULL,
    "evidenceStableId" TEXT NOT NULL,
    "settlementId" UUID NOT NULL,
    "artifactId" UUID NOT NULL,
    "linkedByActorRef" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingExternalSaleSettlementEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSale_externalSaleStableId_key" ON "AccountingExternalSale"("externalSaleStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSale_idempotencyKey_key" ON "AccountingExternalSale"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSale_journalEntryStableId_key" ON "AccountingExternalSale"("journalEntryStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSale_reversalStableId_key" ON "AccountingExternalSale"("reversalStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSale_reversalJournalEntryStableId_key" ON "AccountingExternalSale"("reversalJournalEntryStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSale_replacementForExternalSaleId_key" ON "AccountingExternalSale"("replacementForExternalSaleId");

-- CreateIndex
CREATE INDEX "AccountingExternalSale_storeStableId_occurredOn_idx" ON "AccountingExternalSale"("storeStableId", "occurredOn");

-- CreateIndex
CREATE INDEX "AccountingExternalSale_classificationStableId_occurredOn_idx" ON "AccountingExternalSale"("classificationStableId", "occurredOn");

-- CreateIndex
CREATE INDEX "AccountingExternalSale_counterpartyName_occurredOn_idx" ON "AccountingExternalSale"("counterpartyName", "occurredOn");

-- CreateIndex
CREATE INDEX "AccountingExternalSale_factHash_idx" ON "AccountingExternalSale"("factHash");

-- CreateIndex
CREATE INDEX "AccountingExternalSale_replacementForExternalSaleId_idx" ON "AccountingExternalSale"("replacementForExternalSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleLine_lineStableId_key" ON "AccountingExternalSaleLine"("lineStableId");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleLine_externalSaleId_idx" ON "AccountingExternalSaleLine"("externalSaleId");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleLine_revenueAccountId_idx" ON "AccountingExternalSaleLine"("revenueAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleLine_externalSaleId_sortOrder_key" ON "AccountingExternalSaleLine"("externalSaleId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleAdjustment_adjustmentStableId_key" ON "AccountingExternalSaleAdjustment"("adjustmentStableId");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleAdjustment_externalSaleId_idx" ON "AccountingExternalSaleAdjustment"("externalSaleId");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleAdjustment_revenueAccountId_idx" ON "AccountingExternalSaleAdjustment"("revenueAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleAdjustment_externalSaleId_sortOrder_key" ON "AccountingExternalSaleAdjustment"("externalSaleId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleTax_taxStableId_key" ON "AccountingExternalSaleTax"("taxStableId");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleTax_externalSaleId_idx" ON "AccountingExternalSaleTax"("externalSaleId");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleTax_liabilityAccountId_idx" ON "AccountingExternalSaleTax"("liabilityAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleTax_externalSaleId_sortOrder_key" ON "AccountingExternalSaleTax"("externalSaleId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlement_settlementStableId_key" ON "AccountingExternalSaleSettlement"("settlementStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlement_idempotencyKey_key" ON "AccountingExternalSaleSettlement"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlement_journalEntryStableId_key" ON "AccountingExternalSaleSettlement"("journalEntryStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlement_reversalStableId_key" ON "AccountingExternalSaleSettlement"("reversalStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlement_reversalJournalEntryStable_key" ON "AccountingExternalSaleSettlement"("reversalJournalEntryStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlement_replacementForSettlementId_key" ON "AccountingExternalSaleSettlement"("replacementForSettlementId");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleSettlement_storeStableId_settlementOn_idx" ON "AccountingExternalSaleSettlement"("storeStableId", "settlementOn");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleSettlement_counterpartyName_settlemen_idx" ON "AccountingExternalSaleSettlement"("counterpartyName", "settlementOn");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleSettlement_factHash_idx" ON "AccountingExternalSaleSettlement"("factHash");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleSettlement_replacementForSettlementId_idx" ON "AccountingExternalSaleSettlement"("replacementForSettlementId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlementAllocation_allocationStable_key" ON "AccountingExternalSaleSettlementAllocation"("allocationStableId");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleSettlementAllocation_externalSaleId_idx" ON "AccountingExternalSaleSettlementAllocation"("externalSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlementAllocation_settlementId_ext_key" ON "AccountingExternalSaleSettlementAllocation"("settlementId", "externalSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlementAllocation_settlementId_sor_key" ON "AccountingExternalSaleSettlementAllocation"("settlementId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlementComponent_componentStableId_key" ON "AccountingExternalSaleSettlementComponent"("componentStableId");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleSettlementComponent_accountId_idx" ON "AccountingExternalSaleSettlementComponent"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlementComponent_settlementId_sort_key" ON "AccountingExternalSaleSettlementComponent"("settlementId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleEvidence_evidenceStableId_key" ON "AccountingExternalSaleEvidence"("evidenceStableId");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleEvidence_artifactId_idx" ON "AccountingExternalSaleEvidence"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleEvidence_externalSaleId_artifactId_key" ON "AccountingExternalSaleEvidence"("externalSaleId", "artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlementEvidence_evidenceStableId_key" ON "AccountingExternalSaleSettlementEvidence"("evidenceStableId");

-- CreateIndex
CREATE INDEX "AccountingExternalSaleSettlementEvidence_artifactId_idx" ON "AccountingExternalSaleSettlementEvidence"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExternalSaleSettlementEvidence_settlementId_artif_key" ON "AccountingExternalSaleSettlementEvidence"("settlementId", "artifactId");

-- AddForeignKey
ALTER TABLE "AccountingExternalSale" ADD CONSTRAINT "AccountingExternalSale_replacementForExternalSaleId_fkey" FOREIGN KEY ("replacementForExternalSaleId") REFERENCES "AccountingExternalSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleLine" ADD CONSTRAINT "AccountingExternalSaleLine_externalSaleId_fkey" FOREIGN KEY ("externalSaleId") REFERENCES "AccountingExternalSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleLine" ADD CONSTRAINT "AccountingExternalSaleLine_revenueAccountId_fkey" FOREIGN KEY ("revenueAccountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleAdjustment" ADD CONSTRAINT "AccountingExternalSaleAdjustment_externalSaleId_fkey" FOREIGN KEY ("externalSaleId") REFERENCES "AccountingExternalSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleAdjustment" ADD CONSTRAINT "AccountingExternalSaleAdjustment_revenueAccountId_fkey" FOREIGN KEY ("revenueAccountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleTax" ADD CONSTRAINT "AccountingExternalSaleTax_externalSaleId_fkey" FOREIGN KEY ("externalSaleId") REFERENCES "AccountingExternalSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleTax" ADD CONSTRAINT "AccountingExternalSaleTax_liabilityAccountId_fkey" FOREIGN KEY ("liabilityAccountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleSettlement" ADD CONSTRAINT "AccountingExternalSaleSettlement_replacementForSettlementI_fkey" FOREIGN KEY ("replacementForSettlementId") REFERENCES "AccountingExternalSaleSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleSettlementAllocation" ADD CONSTRAINT "AccountingExternalSaleSettlementAllocation_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "AccountingExternalSaleSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleSettlementAllocation" ADD CONSTRAINT "AccountingExternalSaleSettlementAllocation_externalSaleId_fkey" FOREIGN KEY ("externalSaleId") REFERENCES "AccountingExternalSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleSettlementComponent" ADD CONSTRAINT "AccountingExternalSaleSettlementComponent_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "AccountingExternalSaleSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleSettlementComponent" ADD CONSTRAINT "AccountingExternalSaleSettlementComponent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleEvidence" ADD CONSTRAINT "AccountingExternalSaleEvidence_externalSaleId_fkey" FOREIGN KEY ("externalSaleId") REFERENCES "AccountingExternalSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleEvidence" ADD CONSTRAINT "AccountingExternalSaleEvidence_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AccountingSourceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleSettlementEvidence" ADD CONSTRAINT "AccountingExternalSaleSettlementEvidence_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "AccountingExternalSaleSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExternalSaleSettlementEvidence" ADD CONSTRAINT "AccountingExternalSaleSettlementEvidence_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AccountingSourceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
