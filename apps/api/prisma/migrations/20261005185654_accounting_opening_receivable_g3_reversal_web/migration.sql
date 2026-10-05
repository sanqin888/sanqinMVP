/*
  Warnings:

  - A unique constraint covering the columns `[reversalStableId]` on the table `AccountingOpeningReceivable` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[reversalJournalEntryStableId]` on the table `AccountingOpeningReceivable` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[replacementForOpeningReceivableId]` on the table `AccountingOpeningReceivable` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[reversalStableId]` on the table `AccountingOpeningReceivableSettlement` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[reversalJournalEntryStableId]` on the table `AccountingOpeningReceivableSettlement` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[replacementForSettlementId]` on the table `AccountingOpeningReceivableSettlement` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AccountingOpeningReceivable" ADD COLUMN     "replacementForOpeningReceivableId" UUID,
ADD COLUMN     "reversalFactHash" TEXT,
ADD COLUMN     "reversalJournalEntryStableId" TEXT,
ADD COLUMN     "reversalStableId" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedByActorRef" TEXT;

-- AlterTable
ALTER TABLE "AccountingOpeningReceivableSettlement" ADD COLUMN     "replacementForSettlementId" UUID,
ADD COLUMN     "reversalFactHash" TEXT,
ADD COLUMN     "reversalJournalEntryStableId" TEXT,
ADD COLUMN     "reversalStableId" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedByActorRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AccountingOpeningReceivable_reversalStableId_key" ON "AccountingOpeningReceivable"("reversalStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingOpeningReceivable_reversalJournalEntryStableId_key" ON "AccountingOpeningReceivable"("reversalJournalEntryStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingOpeningReceivable_replacementForOpeningReceivable_key" ON "AccountingOpeningReceivable"("replacementForOpeningReceivableId");

-- CreateIndex
CREATE INDEX "AccountingOpeningReceivable_replacementForOpeningReceivable_idx" ON "AccountingOpeningReceivable"("replacementForOpeningReceivableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingOpeningReceivableSettlement_reversalStableId_key" ON "AccountingOpeningReceivableSettlement"("reversalStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingOpeningReceivableSettlement_reversalJournalEntryS_key" ON "AccountingOpeningReceivableSettlement"("reversalJournalEntryStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingOpeningReceivableSettlement_replacementForSettlem_key" ON "AccountingOpeningReceivableSettlement"("replacementForSettlementId");

-- CreateIndex
CREATE INDEX "AccountingOpeningReceivableSettlement_replacementForSettlem_idx" ON "AccountingOpeningReceivableSettlement"("replacementForSettlementId");

-- AddForeignKey
ALTER TABLE "AccountingOpeningReceivable" ADD CONSTRAINT "AccountingOpeningReceivable_replacementForOpeningReceivabl_fkey" FOREIGN KEY ("replacementForOpeningReceivableId") REFERENCES "AccountingOpeningReceivable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingOpeningReceivableSettlement" ADD CONSTRAINT "AccountingOpeningReceivableSettlement_replacementForSettle_fkey" FOREIGN KEY ("replacementForSettlementId") REFERENCES "AccountingOpeningReceivableSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
