-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'POSTED', 'REVERSED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PayrollPayFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PayrollTd1Mode" AS ENUM ('FILED_TOTAL_CLAIM', 'NO_FORM_DEFAULT');

-- CreateEnum
CREATE TYPE "PayrollIncomeTaxTreatment" AS ENUM ('STANDARD', 'TD1_CLAIM_CODE_E_REVIEWED');

-- CreateEnum
CREATE TYPE "PayrollCppTreatment" AS ENUM ('STANDARD', 'EXEMPT_REVIEWED');

-- CreateEnum
CREATE TYPE "PayrollEiTreatment" AS ENUM ('INSURABLE', 'NON_INSURABLE_REVIEWED');

-- CreateEnum
CREATE TYPE "PayrollVacationTreatment" AS ENUM ('PAID_EACH_RUN', 'ACCRUED');

-- CreateEnum
CREATE TYPE "PayrollRemitterType" AS ENUM ('QUARTERLY', 'REGULAR', 'ACCELERATED_THRESHOLD_1', 'ACCELERATED_THRESHOLD_2');

-- AlterEnum
ALTER TYPE "AccountingJournalSource" ADD VALUE 'PAYROLL';

-- CreateTable
CREATE TABLE "PayrollEmployer" (
    "id" UUID NOT NULL,
    "employerStableId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT,
    "defaultStoreStableId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByActorRef" TEXT NOT NULL,
    "updatedByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEmployer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEmployerConfigVersion" (
    "id" UUID NOT NULL,
    "configStableId" TEXT NOT NULL,
    "employerId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "remitterType" "PayrollRemitterType" NOT NULL,
    "eiEmployerMultiplierMicros" INTEGER NOT NULL,
    "createdByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollEmployerConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEmployee" (
    "id" UUID NOT NULL,
    "employeeStableId" TEXT NOT NULL,
    "employerId" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT,
    "userStableId" TEXT,
    "storeStableId" TEXT,
    "employmentStartDate" DATE NOT NULL,
    "employmentEndDate" DATE,
    "vacationServiceStartDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByActorRef" TEXT NOT NULL,
    "updatedByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEmployeeConfigVersion" (
    "id" UUID NOT NULL,
    "configStableId" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "provinceOfEmployment" TEXT NOT NULL,
    "payFrequency" "PayrollPayFrequency" NOT NULL,
    "payScheduleAnchorDate" DATE NOT NULL,
    "defaultHourlyRateCents" INTEGER NOT NULL,
    "federalTd1Mode" "PayrollTd1Mode" NOT NULL,
    "federalTd1TotalClaimCents" INTEGER,
    "ontarioTd1Mode" "PayrollTd1Mode" NOT NULL,
    "ontarioTd1TotalClaimCents" INTEGER,
    "incomeTaxTreatment" "PayrollIncomeTaxTreatment" NOT NULL,
    "additionalTaxPerPayCents" INTEGER NOT NULL DEFAULT 0,
    "cppTreatment" "PayrollCppTreatment" NOT NULL,
    "cppExceptionCode" TEXT,
    "cppExceptionNote" TEXT,
    "eiTreatment" "PayrollEiTreatment" NOT NULL,
    "eiExceptionCode" TEXT,
    "eiExceptionNote" TEXT,
    "vacationTreatment" "PayrollVacationTreatment" NOT NULL,
    "vacationRateBasisPoints" INTEGER NOT NULL,
    "vacationAgreementConfirmedAt" TIMESTAMP(3),
    "vacationAgreementNote" TEXT,
    "calculationProfileVersion" TEXT NOT NULL,
    "createdByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollEmployeeConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEmployeeYearOpening" (
    "id" UUID NOT NULL,
    "openingStableId" TEXT NOT NULL,
    "employeeId" UUID NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "asOfDate" DATE NOT NULL,
    "grossEarningsYtdCents" INTEGER NOT NULL,
    "netPayYtdCents" INTEGER NOT NULL,
    "periodicEarningsYtdCents" INTEGER NOT NULL,
    "nonPeriodicEarningsYtdCents" INTEGER NOT NULL,
    "pensionableEarningsYtdCents" INTEGER NOT NULL,
    "employeeCppYtdCents" INTEGER NOT NULL,
    "employeeCpp2YtdCents" INTEGER NOT NULL,
    "insurableEarningsYtdCents" INTEGER NOT NULL,
    "employeeEiYtdCents" INTEGER NOT NULL,
    "incomeTaxYtdCents" INTEGER NOT NULL,
    "vacationPayPaidYtdCents" INTEGER NOT NULL,
    "vacationPayAccruedYtdCents" INTEGER NOT NULL,
    "sourceNote" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "confirmedByActorRef" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "updatedByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEmployeeYearOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" UUID NOT NULL,
    "runStableId" TEXT NOT NULL,
    "employerId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "employeeConfigStableId" TEXT,
    "employerConfigStableId" TEXT,
    "correctionOfRunId" UUID,
    "correctionSequence" INTEGER NOT NULL DEFAULT 0,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "payDate" DATE NOT NULL,
    "storeStableId" TEXT NOT NULL,
    "statutoryPolicyVersion" TEXT,
    "payPeriodsPerYear" INTEGER,
    "calculationProfileVersion" TEXT,
    "regularMinutes" INTEGER NOT NULL DEFAULT 0,
    "regularHourlyRateCents" INTEGER NOT NULL,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeHourlyRateCents" INTEGER NOT NULL DEFAULT 0,
    "vacationTopUpCents" INTEGER NOT NULL DEFAULT 0,
    "regularPayCents" INTEGER,
    "overtimePayCents" INTEGER,
    "vacationPayPaidCents" INTEGER,
    "vacationPayAccruedCents" INTEGER,
    "grossPayCents" INTEGER,
    "periodicTaxableEarningsCents" INTEGER,
    "nonPeriodicTaxableEarningsCents" INTEGER,
    "pensionableEarningsCents" INTEGER,
    "insurableEarningsCents" INTEGER,
    "incomeTaxCents" INTEGER,
    "employeeCppCents" INTEGER,
    "employeeCpp2Cents" INTEGER,
    "employeeEiCents" INTEGER,
    "employerCppCents" INTEGER,
    "employerCpp2Cents" INTEGER,
    "employerEiCents" INTEGER,
    "totalEmployeeDeductionsCents" INTEGER,
    "netPayCents" INTEGER,
    "craRemittanceCents" INTEGER,
    "compensationExpenseCents" INTEGER,
    "supportedEmployerPayrollCostCents" INTEGER,
    "calculationEvidenceVersion" INTEGER,
    "calculationInputJson" JSONB,
    "calculationOutputJson" JSONB,
    "calculationHash" TEXT,
    "ytdBeforeJson" JSONB,
    "ytdAfterJson" JSONB,
    "payStatementTemplateVersion" TEXT,
    "approvedByActorRef" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedJournalEntryStableId" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdByActorRef" TEXT NOT NULL,
    "updatedByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployer_employerStableId_key" ON "PayrollEmployer"("employerStableId");

-- CreateIndex
CREATE INDEX "PayrollEmployer_isActive_legalName_idx" ON "PayrollEmployer"("isActive", "legalName");

-- CreateIndex
CREATE INDEX "PayrollEmployer_defaultStoreStableId_idx" ON "PayrollEmployer"("defaultStoreStableId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployerConfigVersion_configStableId_key" ON "PayrollEmployerConfigVersion"("configStableId");

-- CreateIndex
CREATE INDEX "PayrollEmployerConfigVersion_employerId_effectiveFrom_idx" ON "PayrollEmployerConfigVersion"("employerId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployerConfigVersion_employerId_version_key" ON "PayrollEmployerConfigVersion"("employerId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployerConfigVersion_employerId_effectiveFrom_key" ON "PayrollEmployerConfigVersion"("employerId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployee_employeeStableId_key" ON "PayrollEmployee"("employeeStableId");

-- CreateIndex
CREATE INDEX "PayrollEmployee_employerId_isActive_idx" ON "PayrollEmployee"("employerId", "isActive");

-- CreateIndex
CREATE INDEX "PayrollEmployee_storeStableId_isActive_idx" ON "PayrollEmployee"("storeStableId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployee_employerId_userStableId_key" ON "PayrollEmployee"("employerId", "userStableId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployeeConfigVersion_configStableId_key" ON "PayrollEmployeeConfigVersion"("configStableId");

-- CreateIndex
CREATE INDEX "PayrollEmployeeConfigVersion_employeeId_effectiveFrom_idx" ON "PayrollEmployeeConfigVersion"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployeeConfigVersion_employeeId_version_key" ON "PayrollEmployeeConfigVersion"("employeeId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployeeConfigVersion_employeeId_effectiveFrom_key" ON "PayrollEmployeeConfigVersion"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployeeYearOpening_openingStableId_key" ON "PayrollEmployeeYearOpening"("openingStableId");

-- CreateIndex
CREATE INDEX "PayrollEmployeeYearOpening_taxYear_asOfDate_idx" ON "PayrollEmployeeYearOpening"("taxYear", "asOfDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployeeYearOpening_employeeId_taxYear_key" ON "PayrollEmployeeYearOpening"("employeeId", "taxYear");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_runStableId_key" ON "PayrollRun"("runStableId");

-- CreateIndex
CREATE INDEX "PayrollRun_employerId_payDate_idx" ON "PayrollRun"("employerId", "payDate");

-- CreateIndex
CREATE INDEX "PayrollRun_employeeId_payDate_idx" ON "PayrollRun"("employeeId", "payDate");

-- CreateIndex
CREATE INDEX "PayrollRun_storeStableId_payDate_idx" ON "PayrollRun"("storeStableId", "payDate");

-- CreateIndex
CREATE INDEX "PayrollRun_status_payDate_idx" ON "PayrollRun"("status", "payDate");

-- CreateIndex
CREATE INDEX "PayrollRun_correctionOfRunId_idx" ON "PayrollRun"("correctionOfRunId");

-- CreateIndex
CREATE INDEX "PayrollRun_employeeConfigStableId_idx" ON "PayrollRun"("employeeConfigStableId");

-- CreateIndex
CREATE INDEX "PayrollRun_employerConfigStableId_idx" ON "PayrollRun"("employerConfigStableId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_employeeId_periodStart_periodEnd_payDate_correct_key" ON "PayrollRun"("employeeId", "periodStart", "periodEnd", "payDate", "correctionSequence");

-- AddForeignKey
ALTER TABLE "PayrollEmployerConfigVersion" ADD CONSTRAINT "PayrollEmployerConfigVersion_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "PayrollEmployer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEmployee" ADD CONSTRAINT "PayrollEmployee_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "PayrollEmployer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEmployeeConfigVersion" ADD CONSTRAINT "PayrollEmployeeConfigVersion_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PayrollEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEmployeeYearOpening" ADD CONSTRAINT "PayrollEmployeeYearOpening_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PayrollEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "PayrollEmployer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PayrollEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_employeeConfigStableId_fkey" FOREIGN KEY ("employeeConfigStableId") REFERENCES "PayrollEmployeeConfigVersion"("configStableId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_employerConfigStableId_fkey" FOREIGN KEY ("employerConfigStableId") REFERENCES "PayrollEmployerConfigVersion"("configStableId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_correctionOfRunId_fkey" FOREIGN KEY ("correctionOfRunId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
