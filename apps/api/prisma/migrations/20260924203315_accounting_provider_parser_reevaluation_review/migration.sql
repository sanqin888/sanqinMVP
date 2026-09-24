-- AlterTable
ALTER TABLE "AccountingProviderFinancialReviewRevision" ADD COLUMN     "effectiveSnapshotParseRunId" UUID,
ADD COLUMN     "effectiveSnapshotParserName" TEXT,
ADD COLUMN     "effectiveSnapshotParserVersion" TEXT,
ADD COLUMN     "effectiveSnapshotSourceParseRunId" UUID;

-- CreateTable
CREATE TABLE "AccountingProviderFinancialReviewedLine" (
    "id" UUID NOT NULL,
    "reviewedLineStableId" TEXT NOT NULL,
    "reviewRevisionId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "sourceLineStableId" TEXT,
    "rawCode" TEXT,
    "rawName" TEXT,
    "component" "AccountingFinancialComponent" NOT NULL,
    "postingTreatment" "AccountingFinancialPostingTreatment" NOT NULL,
    "taxRole" "AccountingFinancialTaxRole" NOT NULL DEFAULT 'NONE',
    "amountCents" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingProviderFinancialReviewedLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingProviderFinancialReviewedLine_reviewedLineStableI_key" ON "AccountingProviderFinancialReviewedLine"("reviewedLineStableId");

-- CreateIndex
CREATE INDEX "AcctProviderFinReviewedLine_source_line_idx" ON "AccountingProviderFinancialReviewedLine"("sourceLineStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AcctProviderFinReviewedLine_rev_no_key" ON "AccountingProviderFinancialReviewedLine"("reviewRevisionId", "lineNo");

-- CreateIndex
CREATE INDEX "AcctProviderFinReview_effective_parse_run_idx" ON "AccountingProviderFinancialReviewRevision"("effectiveSnapshotParseRunId");

-- CreateIndex
CREATE INDEX "AcctProviderFinReview_source_parse_run_idx" ON "AccountingProviderFinancialReviewRevision"("effectiveSnapshotSourceParseRunId");

-- AddForeignKey
ALTER TABLE "AccountingProviderFinancialReviewRevision" ADD CONSTRAINT "AcctProviderFinReview_effective_parse_run_fkey" FOREIGN KEY ("effectiveSnapshotParseRunId") REFERENCES "AccountingParseRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingProviderFinancialReviewRevision" ADD CONSTRAINT "AcctProviderFinReview_source_parse_run_fkey" FOREIGN KEY ("effectiveSnapshotSourceParseRunId") REFERENCES "AccountingParseRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingProviderFinancialReviewedLine" ADD CONSTRAINT "AccountingProviderFinancialReviewedLine_reviewRevisionId_fkey" FOREIGN KEY ("reviewRevisionId") REFERENCES "AccountingProviderFinancialReviewRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
