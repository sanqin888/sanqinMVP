-- CreateTable
CREATE TABLE "AccountingOpeningReceivable" (
    "id" UUID NOT NULL,
    "openingReceivableStableId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "storeStableId" TEXT NOT NULL,
    "openingDate" DATE NOT NULL,
    "counterpartyName" TEXT NOT NULL,
    "reference" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "factHash" TEXT NOT NULL,
    "journalEntryStableId" TEXT,
    "note" TEXT,
    "createdByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingOpeningReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingOpeningReceivable_openingReceivableStableId_key" ON "AccountingOpeningReceivable"("openingReceivableStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingOpeningReceivable_idempotencyKey_key" ON "AccountingOpeningReceivable"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingOpeningReceivable_journalEntryStableId_key" ON "AccountingOpeningReceivable"("journalEntryStableId");

-- CreateIndex
CREATE INDEX "AccountingOpeningReceivable_storeStableId_openingDate_idx" ON "AccountingOpeningReceivable"("storeStableId", "openingDate");

-- CreateIndex
CREATE INDEX "AccountingOpeningReceivable_counterpartyName_openingDate_idx" ON "AccountingOpeningReceivable"("counterpartyName", "openingDate");

-- CreateIndex
CREATE INDEX "AccountingOpeningReceivable_factHash_idx" ON "AccountingOpeningReceivable"("factHash");
