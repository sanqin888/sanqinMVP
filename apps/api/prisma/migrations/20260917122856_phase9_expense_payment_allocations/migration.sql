/*
  Warnings:

  - You are about to drop the column `accountId` on the `AccountingExpenseDocument` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "AccountingExpenseDocument" DROP CONSTRAINT "AccountingExpenseDocument_accountId_fkey";

-- DropIndex
DROP INDEX "AccountingExpenseDocument_accountId_idx";

-- AlterTable
ALTER TABLE "AccountingExpenseDocument" DROP COLUMN "accountId";

-- CreateTable
CREATE TABLE "AccountingExpensePaymentAllocation" (
    "id" UUID NOT NULL,
    "paymentAllocationStableId" TEXT NOT NULL,
    "expenseDocumentId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingExpensePaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExpensePaymentAllocation_paymentAllocationStableI_key" ON "AccountingExpensePaymentAllocation"("paymentAllocationStableId");

-- CreateIndex
CREATE INDEX "AccountingExpensePaymentAllocation_expenseDocumentId_idx" ON "AccountingExpensePaymentAllocation"("expenseDocumentId");

-- CreateIndex
CREATE INDEX "AccountingExpensePaymentAllocation_accountId_idx" ON "AccountingExpensePaymentAllocation"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExpensePaymentAllocation_expenseDocumentId_accoun_key" ON "AccountingExpensePaymentAllocation"("expenseDocumentId", "accountId");

-- AddForeignKey
ALTER TABLE "AccountingExpensePaymentAllocation" ADD CONSTRAINT "AccountingExpensePaymentAllocation_expenseDocumentId_fkey" FOREIGN KEY ("expenseDocumentId") REFERENCES "AccountingExpenseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExpensePaymentAllocation" ADD CONSTRAINT "AccountingExpensePaymentAllocation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
