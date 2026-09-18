-- CreateTable
CREATE TABLE "PayrollEmployeePayment" (
    "id" UUID NOT NULL,
    "paymentStableId" TEXT NOT NULL,
    "runId" UUID NOT NULL,
    "paymentAccountStableId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "paymentDate" DATE NOT NULL,
    "reference" TEXT,
    "journalEntryStableId" TEXT,
    "createdByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollEmployeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployeePayment_paymentStableId_key" ON "PayrollEmployeePayment"("paymentStableId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployeePayment_runId_key" ON "PayrollEmployeePayment"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployeePayment_journalEntryStableId_key" ON "PayrollEmployeePayment"("journalEntryStableId");

-- CreateIndex
CREATE INDEX "PayrollEmployeePayment_paymentDate_idx" ON "PayrollEmployeePayment"("paymentDate");

-- CreateIndex
CREATE INDEX "PayrollEmployeePayment_paymentAccountStableId_paymentDate_idx" ON "PayrollEmployeePayment"("paymentAccountStableId", "paymentDate");

-- AddForeignKey
ALTER TABLE "PayrollEmployeePayment" ADD CONSTRAINT "PayrollEmployeePayment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
