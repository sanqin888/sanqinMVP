/*
  Warnings:

  - A unique constraint covering the columns `[reversalJournalEntryStableId]` on the table `PayrollRun` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "reversalJournalEntryStableId" TEXT,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedByActorRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_reversalJournalEntryStableId_key" ON "PayrollRun"("reversalJournalEntryStableId");
