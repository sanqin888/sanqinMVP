-- AlterTable
ALTER TABLE "AccountingAccount" ADD COLUMN     "includeFundedExpensesInManagementReports" BOOLEAN DEFAULT true;

-- AlterTable
ALTER TABLE "AccountingExpenseDocument" ADD COLUMN     "fundingAttributionVersion" INTEGER DEFAULT 1;

-- AlterTable
ALTER TABLE "AccountingExpenseSplit" ADD COLUMN     "paidFromAccountId" UUID;

-- CreateIndex
CREATE INDEX "AccountingExpenseSplit_paidFromAccountId_idx" ON "AccountingExpenseSplit"("paidFromAccountId");

-- AddForeignKey
ALTER TABLE "AccountingExpenseSplit" ADD CONSTRAINT "AccountingExpenseSplit_paidFromAccountId_fkey" FOREIGN KEY ("paidFromAccountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
