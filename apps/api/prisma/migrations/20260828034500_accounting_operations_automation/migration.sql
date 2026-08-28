-- CreateEnum
CREATE TYPE "AccountingDocumentSource" AS ENUM ('MANUAL', 'GMAIL');

-- CreateEnum
CREATE TYPE "AccountingDocumentStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'DUPLICATE', 'ERROR');

-- CreateEnum
CREATE TYPE "UberFinancialReportStatus" AS ENUM ('REQUESTED', 'READY', 'IMPORTED', 'ERROR');

-- AlterTable: add a stable business identifier without assuming AccountingCategory is empty.
ALTER TABLE "AccountingCategory" ADD COLUMN "categoryStableId" TEXT;
UPDATE "AccountingCategory"
SET "categoryStableId" = 'category_legacy_' || md5("id"::text)
WHERE "categoryStableId" IS NULL;
ALTER TABLE "AccountingCategory" ALTER COLUMN "categoryStableId" SET NOT NULL;

-- AlterTable: track recoverable HST separately and link split expenses to one source document.
ALTER TABLE "AccountingTransaction"
ADD COLUMN "taxCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "documentId" UUID;

-- CreateTable
CREATE TABLE "AccountingExpenseDocument" (
    "id" UUID NOT NULL,
    "documentStableId" TEXT NOT NULL,
    "source" "AccountingDocumentSource" NOT NULL DEFAULT 'MANUAL',
    "status" "AccountingDocumentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "occurredAt" TIMESTAMP(3),
    "subtotalCents" INTEGER,
    "taxCents" INTEGER,
    "totalCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "accountId" UUID,
    "gmailMessageId" TEXT,
    "gmailAttachmentId" TEXT,
    "fileHash" TEXT,
    "emailSubject" TEXT,
    "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extractedText" TEXT,
    "extractionJson" JSONB,
    "memo" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingExpenseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UberFinancialReport" (
    "id" UUID NOT NULL,
    "reportStableId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "storeUuids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "status" "UberFinancialReportStatus" NOT NULL DEFAULT 'REQUESTED',
    "downloadUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "artifactUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawMetadata" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UberFinancialReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingAutomationConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',
    "runHour" INTEGER NOT NULL DEFAULT 2,
    "runMinute" INTEGER NOT NULL DEFAULT 15,
    "gmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "uberReportsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingAutomationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingCategory_categoryStableId_key" ON "AccountingCategory"("categoryStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExpenseDocument_documentStableId_key" ON "AccountingExpenseDocument"("documentStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExpenseDocument_fileHash_key" ON "AccountingExpenseDocument"("fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingExpenseDocument_gmailMessageId_gmailAttachmentId_key" ON "AccountingExpenseDocument"("gmailMessageId", "gmailAttachmentId");

-- CreateIndex
CREATE INDEX "AccountingExpenseDocument_status_createdAt_idx" ON "AccountingExpenseDocument"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AccountingExpenseDocument_source_createdAt_idx" ON "AccountingExpenseDocument"("source", "createdAt");

-- CreateIndex
CREATE INDEX "AccountingExpenseDocument_occurredAt_idx" ON "AccountingExpenseDocument"("occurredAt");

-- CreateIndex
CREATE INDEX "AccountingExpenseDocument_accountId_idx" ON "AccountingExpenseDocument"("accountId");

-- CreateIndex
CREATE INDEX "AccountingTransaction_documentId_idx" ON "AccountingTransaction"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "UberFinancialReport_reportStableId_key" ON "UberFinancialReport"("reportStableId");

-- CreateIndex
CREATE UNIQUE INDEX "UberFinancialReport_workflowId_key" ON "UberFinancialReport"("workflowId");

-- CreateIndex
CREATE INDEX "UberFinancialReport_reportType_requestedAt_idx" ON "UberFinancialReport"("reportType", "requestedAt");

-- CreateIndex
CREATE INDEX "UberFinancialReport_status_requestedAt_idx" ON "UberFinancialReport"("status", "requestedAt");

-- AddForeignKey
ALTER TABLE "AccountingExpenseDocument" ADD CONSTRAINT "AccountingExpenseDocument_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingTransaction" ADD CONSTRAINT "AccountingTransaction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountingExpenseDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
