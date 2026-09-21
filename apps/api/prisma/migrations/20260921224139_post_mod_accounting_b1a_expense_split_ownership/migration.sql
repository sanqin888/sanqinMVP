-- CreateTable
CREATE TABLE "AccountingExpenseSplit" (
    "id" UUID NOT NULL,
    "splitStableId" TEXT NOT NULL,
    "expenseDocumentId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingExpenseSplit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExpenseSplit_splitStableId_key" ON "AccountingExpenseSplit"("splitStableId");

-- CreateIndex
CREATE INDEX "AccountingExpenseSplit_expenseDocumentId_idx" ON "AccountingExpenseSplit"("expenseDocumentId");

-- CreateIndex
CREATE INDEX "AccountingExpenseSplit_categoryId_idx" ON "AccountingExpenseSplit"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExpenseSplit_expenseDocumentId_sortOrder_key" ON "AccountingExpenseSplit"("expenseDocumentId", "sortOrder");

-- AddForeignKey
ALTER TABLE "AccountingExpenseSplit" ADD CONSTRAINT "AccountingExpenseSplit_expenseDocumentId_fkey" FOREIGN KEY ("expenseDocumentId") REFERENCES "AccountingExpenseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExpenseSplit" ADD CONSTRAINT "AccountingExpenseSplit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AccountingCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
