-- CreateEnum
CREATE TYPE "AccountingCorrectionTargetKind" AS ENUM ('PROVIDER_SETTLEMENT', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountingCorrectionStatus" AS ENUM ('DRAFT', 'READY', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountingCorrectionReasonCode" AS ENUM ('EXTRACTION_ERROR', 'AMOUNT_ERROR', 'CLASSIFICATION_ERROR', 'MISSING_COMPONENT', 'DUPLICATE_POSTING', 'BUSINESS_FACT_ERROR', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountingCorrectionStrategy" AS ENUM ('DELTA', 'REVERSAL_REPOST', 'REVERSAL_ONLY');

-- CreateEnum
CREATE TYPE "AccountingCorrectionJournalOutputRole" AS ENUM ('DELTA', 'REVERSAL', 'REPOST');

-- CreateTable
CREATE TABLE "AccountingCorrectionCase" (
    "id" UUID NOT NULL,
    "correctionStableId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "targetKind" "AccountingCorrectionTargetKind" NOT NULL,
    "targetStableId" TEXT NOT NULL,
    "targetVersion" INTEGER NOT NULL,
    "status" "AccountingCorrectionStatus" NOT NULL DEFAULT 'DRAFT',
    "reasonCode" "AccountingCorrectionReasonCode" NOT NULL,
    "note" TEXT,
    "strategy" "AccountingCorrectionStrategy",
    "baseAuthoritySchema" TEXT,
    "baseAuthorityHash" TEXT,
    "baseJournalSetHash" TEXT,
    "readyRevisionId" UUID,
    "targetAuthoritySchema" TEXT,
    "targetAuthorityHash" TEXT,
    "readyPreviewSchema" TEXT,
    "readyPreviewJson" JSONB,
    "planHash" TEXT,
    "createdByActorRef" TEXT NOT NULL,
    "readyByActorRef" TEXT,
    "readyAt" TIMESTAMP(3),
    "postedByActorRef" TEXT,
    "postedAt" TIMESTAMP(3),
    "cancelledByActorRef" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingCorrectionCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingCorrectionRevision" (
    "id" UUID NOT NULL,
    "correctionRevisionStableId" TEXT NOT NULL,
    "correctionCaseId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "targetAuthoritySchema" TEXT NOT NULL,
    "targetAuthorityHash" TEXT NOT NULL,
    "targetJson" JSONB NOT NULL,
    "createdByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingCorrectionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingCorrectionJournalOutput" (
    "id" UUID NOT NULL,
    "outputStableId" TEXT NOT NULL,
    "correctionCaseId" UUID NOT NULL,
    "role" "AccountingCorrectionJournalOutputRole" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "journalEntryId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingCorrectionJournalOutput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingCorrectionCase_correctionStableId_key" ON "AccountingCorrectionCase"("correctionStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingCorrectionCase_readyRevisionId_key" ON "AccountingCorrectionCase"("readyRevisionId");

-- CreateIndex
CREATE INDEX "AcctCorrectionCase_target_status_idx" ON "AccountingCorrectionCase"("targetKind", "targetStableId", "status");

-- CreateIndex
CREATE INDEX "AcctCorrectionCase_status_created_idx" ON "AccountingCorrectionCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AcctCorrectionCase_target_created_idx" ON "AccountingCorrectionCase"("targetKind", "targetStableId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingCorrectionRevision_correctionRevisionStableId_key" ON "AccountingCorrectionRevision"("correctionRevisionStableId");

-- CreateIndex
CREATE INDEX "AcctCorrectionRevision_case_created_idx" ON "AccountingCorrectionRevision"("correctionCaseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcctCorrectionRevision_case_rev_key" ON "AccountingCorrectionRevision"("correctionCaseId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingCorrectionJournalOutput_outputStableId_key" ON "AccountingCorrectionJournalOutput"("outputStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingCorrectionJournalOutput_journalEntryId_key" ON "AccountingCorrectionJournalOutput"("journalEntryId");

-- CreateIndex
CREATE INDEX "AcctCorrectionOutput_case_idx" ON "AccountingCorrectionJournalOutput"("correctionCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "AcctCorrectionOutput_case_role_seq_key" ON "AccountingCorrectionJournalOutput"("correctionCaseId", "role", "sequence");

-- AddForeignKey
ALTER TABLE "AccountingCorrectionCase" ADD CONSTRAINT "AccountingCorrectionCase_readyRevisionId_fkey" FOREIGN KEY ("readyRevisionId") REFERENCES "AccountingCorrectionRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingCorrectionRevision" ADD CONSTRAINT "AccountingCorrectionRevision_correctionCaseId_fkey" FOREIGN KEY ("correctionCaseId") REFERENCES "AccountingCorrectionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingCorrectionJournalOutput" ADD CONSTRAINT "AccountingCorrectionJournalOutput_correctionCaseId_fkey" FOREIGN KEY ("correctionCaseId") REFERENCES "AccountingCorrectionCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingCorrectionJournalOutput" ADD CONSTRAINT "AccountingCorrectionJournalOutput_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "AccountingJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
