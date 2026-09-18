-- CreateTable
CREATE TABLE "PayrollCraRemittance" (
    "id" UUID NOT NULL,
    "remittanceStableId" TEXT NOT NULL,
    "employerId" UUID NOT NULL,
    "remitterType" "PayrollRemitterType" NOT NULL,
    "remittancePolicyVersion" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "incomeTaxCents" INTEGER NOT NULL,
    "employeeCppCents" INTEGER NOT NULL,
    "employeeCpp2Cents" INTEGER NOT NULL,
    "employerCppCents" INTEGER NOT NULL,
    "employerCpp2Cents" INTEGER NOT NULL,
    "employeeEiCents" INTEGER NOT NULL,
    "employerEiCents" INTEGER NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "evidenceHash" TEXT NOT NULL,
    "paymentAccountStableId" TEXT,
    "paymentDate" DATE,
    "reference" TEXT,
    "journalEntryStableId" TEXT,
    "createdByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollCraRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollCraRemittanceRun" (
    "id" UUID NOT NULL,
    "remittanceId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "employerConfigStableId" TEXT NOT NULL,
    "calculationHash" TEXT NOT NULL,
    "postedAccrualJournalEntryStableId" TEXT NOT NULL,
    "payDate" DATE NOT NULL,
    "incomeTaxCents" INTEGER NOT NULL,
    "employeeCppCents" INTEGER NOT NULL,
    "employeeCpp2Cents" INTEGER NOT NULL,
    "employerCppCents" INTEGER NOT NULL,
    "employerCpp2Cents" INTEGER NOT NULL,
    "employeeEiCents" INTEGER NOT NULL,
    "employerEiCents" INTEGER NOT NULL,
    "craRemittanceCents" INTEGER NOT NULL,

    CONSTRAINT "PayrollCraRemittanceRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCraRemittance_remittanceStableId_key" ON "PayrollCraRemittance"("remittanceStableId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCraRemittance_evidenceHash_key" ON "PayrollCraRemittance"("evidenceHash");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCraRemittance_journalEntryStableId_key" ON "PayrollCraRemittance"("journalEntryStableId");

-- CreateIndex
CREATE INDEX "PayrollCraRemittance_employerId_periodStart_periodEnd_idx" ON "PayrollCraRemittance"("employerId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PayrollCraRemittance_dueDate_idx" ON "PayrollCraRemittance"("dueDate");

-- CreateIndex
CREATE INDEX "PayrollCraRemittance_paymentDate_idx" ON "PayrollCraRemittance"("paymentDate");

-- CreateIndex
CREATE INDEX "PayrollCraRemittance_paymentAccountStableId_paymentDate_idx" ON "PayrollCraRemittance"("paymentAccountStableId", "paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCraRemittanceRun_runId_key" ON "PayrollCraRemittanceRun"("runId");

-- CreateIndex
CREATE INDEX "PayrollCraRemittanceRun_remittanceId_idx" ON "PayrollCraRemittanceRun"("remittanceId");

-- CreateIndex
CREATE INDEX "PayrollCraRemittanceRun_payDate_idx" ON "PayrollCraRemittanceRun"("payDate");

-- AddForeignKey
ALTER TABLE "PayrollCraRemittance" ADD CONSTRAINT "PayrollCraRemittance_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "PayrollEmployer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCraRemittanceRun" ADD CONSTRAINT "PayrollCraRemittanceRun_remittanceId_fkey" FOREIGN KEY ("remittanceId") REFERENCES "PayrollCraRemittance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCraRemittanceRun" ADD CONSTRAINT "PayrollCraRemittanceRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
