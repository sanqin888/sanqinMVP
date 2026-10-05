-- CreateTable
CREATE TABLE "AccountingOpeningReceivableSettlement" (
    "id" UUID NOT NULL,
    "settlementStableId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "openingReceivableId" UUID NOT NULL,
    "storeStableId" TEXT NOT NULL,
    "settlementOn" DATE NOT NULL,
    "counterpartyName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "collectionAccountId" UUID NOT NULL,
    "reference" TEXT,
    "factHash" TEXT NOT NULL,
    "journalEntryStableId" TEXT,
    "note" TEXT,
    "createdByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingOpeningReceivableSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingOpeningReceivableSettlement_settlementStableId_key" ON "AccountingOpeningReceivableSettlement"("settlementStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingOpeningReceivableSettlement_idempotencyKey_key" ON "AccountingOpeningReceivableSettlement"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingOpeningReceivableSettlement_journalEntryStableId_key" ON "AccountingOpeningReceivableSettlement"("journalEntryStableId");

-- CreateIndex
CREATE INDEX "AccountingOpeningReceivableSettlement_openingReceivableId_s_idx" ON "AccountingOpeningReceivableSettlement"("openingReceivableId", "settlementOn");

-- CreateIndex
CREATE INDEX "AccountingOpeningReceivableSettlement_storeStableId_settlem_idx" ON "AccountingOpeningReceivableSettlement"("storeStableId", "settlementOn");

-- CreateIndex
CREATE INDEX "AccountingOpeningReceivableSettlement_counterpartyName_sett_idx" ON "AccountingOpeningReceivableSettlement"("counterpartyName", "settlementOn");

-- CreateIndex
CREATE INDEX "AccountingOpeningReceivableSettlement_collectionAccountId_s_idx" ON "AccountingOpeningReceivableSettlement"("collectionAccountId", "settlementOn");

-- CreateIndex
CREATE INDEX "AccountingOpeningReceivableSettlement_factHash_idx" ON "AccountingOpeningReceivableSettlement"("factHash");

-- AddForeignKey
ALTER TABLE "AccountingOpeningReceivableSettlement" ADD CONSTRAINT "AccountingOpeningReceivableSettlement_openingReceivableId_fkey" FOREIGN KEY ("openingReceivableId") REFERENCES "AccountingOpeningReceivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingOpeningReceivableSettlement" ADD CONSTRAINT "AccountingOpeningReceivableSettlement_collectionAccountId_fkey" FOREIGN KEY ("collectionAccountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
