-- CreateEnum
CREATE TYPE "AccountingProviderFinancialReviewStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AccountingProviderFinancialCorrectionReason" AS ENUM ('EXTRACTION_CORRECTION', 'SEMANTIC_CLASSIFICATION');

-- CreateTable
CREATE TABLE "AccountingProviderFinancialReviewRevision" (
    "id" UUID NOT NULL,
    "reviewRevisionStableId" TEXT NOT NULL,
    "documentId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "AccountingProviderFinancialReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewHash" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserStableId" TEXT NOT NULL,
    "confirmedByUserStableId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingProviderFinancialReviewRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingProviderFinancialReviewCorrection" (
    "id" UUID NOT NULL,
    "correctionStableId" TEXT NOT NULL,
    "reviewRevisionId" UUID NOT NULL,
    "sourceLineStableId" TEXT NOT NULL,
    "reason" "AccountingProviderFinancialCorrectionReason" NOT NULL,
    "note" TEXT,
    "effectiveRawCode" TEXT,
    "effectiveRawName" TEXT,
    "effectiveComponent" "AccountingFinancialComponent" NOT NULL,
    "effectivePostingTreatment" "AccountingFinancialPostingTreatment" NOT NULL,
    "effectiveTaxRole" "AccountingFinancialTaxRole" NOT NULL,
    "effectiveAmountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingProviderFinancialReviewCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingProviderFinancialReviewRevision_reviewRevisionSta_key" ON "AccountingProviderFinancialReviewRevision"("reviewRevisionStableId");

-- CreateIndex
CREATE INDEX "AcctProviderFinReview_doc_status_rev_idx" ON "AccountingProviderFinancialReviewRevision"("documentId", "status", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "AcctProviderFinReview_doc_rev_key" ON "AccountingProviderFinancialReviewRevision"("documentId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingProviderFinancialReviewCorrection_correctionStabl_key" ON "AccountingProviderFinancialReviewCorrection"("correctionStableId");

-- CreateIndex
CREATE INDEX "AcctProviderFinReviewCorr_source_line_idx" ON "AccountingProviderFinancialReviewCorrection"("sourceLineStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AcctProviderFinReviewCorr_line_key" ON "AccountingProviderFinancialReviewCorrection"("reviewRevisionId", "sourceLineStableId");

-- AddForeignKey
ALTER TABLE "AccountingProviderFinancialReviewRevision" ADD CONSTRAINT "AccountingProviderFinancialReviewRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountingProviderFinancialDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingProviderFinancialReviewCorrection" ADD CONSTRAINT "AccountingProviderFinancialReviewCorrection_reviewRevision_fkey" FOREIGN KEY ("reviewRevisionId") REFERENCES "AccountingProviderFinancialReviewRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
