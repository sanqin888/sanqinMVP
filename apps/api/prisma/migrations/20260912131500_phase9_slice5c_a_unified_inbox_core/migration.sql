-- Phase 9 Slice 5C-A: add the Accounting-owned unified Inbox and provider-financial evidence core.
-- This migration is additive. Existing ExpenseDocument/PlatformSettlementRecord runtime paths remain intact.

-- CreateEnum
CREATE TYPE "AccountingArtifactAcquisitionMode" AS ENUM ('EMAIL', 'MANUAL_UPLOAD', 'PROVIDER_API');
CREATE TYPE "AccountingArtifactKind" AS ENUM ('EMAIL_BODY', 'PDF', 'IMAGE', 'CSV', 'TEXT', 'OTHER');
CREATE TYPE "AccountingInboxClassification" AS ENUM ('EXPENSE_DOCUMENT', 'PROVIDER_FINANCIAL_DOCUMENT', 'UNKNOWN');
CREATE TYPE "AccountingInboxMaterializedEntityType" AS ENUM ('EXPENSE_DOCUMENT', 'PROVIDER_FINANCIAL_DOCUMENT');
CREATE TYPE "AccountingInboxStatus" AS ENUM ('PENDING_REVIEW', 'QUARANTINED', 'DUPLICATE', 'CONFIRMED', 'ERROR', 'DISCARDED');
CREATE TYPE "AccountingInboxTrustDecision" AS ENUM ('TRUSTED', 'UNTRUSTED', 'NOT_APPLICABLE');
CREATE TYPE "AccountingParseStatus" AS ENUM ('PENDING', 'SUCCESS', 'ERROR', 'SKIPPED');
CREATE TYPE "AccountingFinancialProvider" AS ENUM ('CLOVER', 'UBER_EATS', 'FANTUAN');
CREATE TYPE "AccountingFinancialDocumentType" AS ENUM ('BATCH_CONTROL', 'STATEMENT', 'API_REPORT', 'OTHER');
CREATE TYPE "AccountingFinancialComponent" AS ENUM ('SALES', 'SALES_TAX', 'REFUND', 'TIP', 'COMMISSION', 'COMMISSION_TAX', 'PROCESSING_FEE', 'PROCESSING_FEE_TAX', 'PROMOTION', 'SUBSIDY', 'ADVERTISING', 'ADVERTISING_CREDIT', 'CHARGEBACK', 'ADJUSTMENT', 'PAYOUT', 'CONTROL_TOTAL', 'OTHER');
CREATE TYPE "AccountingFinancialPostingTreatment" AS ENUM ('POSTABLE', 'CONTROL_TOTAL', 'RECONCILIATION_ONLY', 'UNCLASSIFIED');
CREATE TYPE "AccountingFinancialTaxRole" AS ENUM ('NONE', 'SALES_TAX', 'INPUT_TAX', 'OTHER_TAX');

-- CreateTable
CREATE TABLE "AccountingSourceArtifact" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "artifactStableId" TEXT NOT NULL,
  "acquisitionMode" "AccountingArtifactAcquisitionMode" NOT NULL,
  "kind" "AccountingArtifactKind" NOT NULL,
  "transportIdentity" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "mimeType" TEXT,
  "originalFilename" TEXT,
  "byteSize" INTEGER,
  "storedUrl" TEXT,
  "bodyText" TEXT,
  "senderEmail" TEXT,
  "emailSubject" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountingSourceArtifact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingSourceArtifact_transport_identity_check" CHECK (length(btrim("transportIdentity")) > 0),
  CONSTRAINT "AccountingSourceArtifact_content_hash_check" CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "AccountingSourceArtifact_byte_size_check" CHECK ("byteSize" IS NULL OR "byteSize" >= 0),
  CONSTRAINT "AccountingSourceArtifact_storage_check" CHECK (
    ("kind" IN ('EMAIL_BODY', 'TEXT') AND length(btrim(COALESCE("bodyText", ''))) > 0)
    OR ("kind" IN ('PDF', 'IMAGE', 'CSV') AND length(btrim(COALESCE("storedUrl", ''))) > 0)
    OR "kind" = 'OTHER'
  ),
  CONSTRAINT "AccountingSourceArtifact_email_check" CHECK ("senderEmail" IS NULL OR "senderEmail" = lower("senderEmail"))
);

CREATE TABLE "AccountingParseRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "parseRunStableId" TEXT NOT NULL,
  "artifactId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "parserName" TEXT NOT NULL,
  "parserVersion" TEXT NOT NULL,
  "status" "AccountingParseStatus" NOT NULL DEFAULT 'PENDING',
  "resultHash" TEXT,
  "resultJson" JSONB,
  "errorMessage" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountingParseRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingParseRun_identity_check" CHECK (
    length(btrim("idempotencyKey")) > 0
    AND length(btrim("parserName")) > 0
    AND length(btrim("parserVersion")) > 0
  ),
  CONSTRAINT "AccountingParseRun_result_hash_check" CHECK ("resultHash" IS NULL OR "resultHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "AccountingParseRun_status_check" CHECK (
    ("status" = 'PENDING' AND "completedAt" IS NULL)
    OR ("status" = 'SUCCESS' AND "completedAt" IS NOT NULL AND "resultHash" IS NOT NULL)
    OR ("status" = 'ERROR' AND "completedAt" IS NOT NULL AND length(btrim(COALESCE("errorMessage", ''))) > 0)
    OR ("status" = 'SKIPPED' AND "completedAt" IS NOT NULL)
  )
);

CREATE TABLE "AccountingInboxItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "inboxItemStableId" TEXT NOT NULL,
  "artifactId" UUID NOT NULL,
  "status" "AccountingInboxStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "classification" "AccountingInboxClassification" NOT NULL DEFAULT 'UNKNOWN',
  "trustDecision" "AccountingInboxTrustDecision" NOT NULL,
  "duplicateOfArtifactId" UUID,
  "materializedEntityType" "AccountingInboxMaterializedEntityType",
  "materializedEntityStableId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserStableId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "AccountingInboxItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingInboxItem_version_check" CHECK ("version" > 0),
  CONSTRAINT "AccountingInboxItem_duplicate_check" CHECK (
    (("status" = 'DUPLICATE' AND "duplicateOfArtifactId" IS NOT NULL)
    OR ("status" <> 'DUPLICATE' AND "duplicateOfArtifactId" IS NULL))
    AND ("duplicateOfArtifactId" IS NULL OR "duplicateOfArtifactId" <> "artifactId")
  ),
  CONSTRAINT "AccountingInboxItem_materialized_entity_check" CHECK (
    ("materializedEntityType" IS NULL AND "materializedEntityStableId" IS NULL)
    OR (
      length(btrim(COALESCE("materializedEntityStableId", ''))) > 0
      AND "status" IN ('PENDING_REVIEW', 'CONFIRMED')
      AND (
        ("materializedEntityType" = 'EXPENSE_DOCUMENT' AND "classification" = 'EXPENSE_DOCUMENT')
        OR ("materializedEntityType" = 'PROVIDER_FINANCIAL_DOCUMENT' AND "classification" = 'PROVIDER_FINANCIAL_DOCUMENT')
      )
    )
  )
);

CREATE TABLE "AccountingTrustedSender" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trustedSenderStableId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "label" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserStableId" TEXT NOT NULL,
  "updatedByUserStableId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountingTrustedSender_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingTrustedSender_email_check" CHECK (
    "email" = lower("email") AND length(btrim("email")) > 3 AND position('@' in "email") > 1
  )
);

CREATE TABLE "AccountingProviderFinancialDocument" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "documentStableId" TEXT NOT NULL,
  "artifactId" UUID NOT NULL,
  "provider" "AccountingFinancialProvider" NOT NULL,
  "documentType" "AccountingFinancialDocumentType" NOT NULL,
  "businessIdentityKey" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "supersedesDocumentId" UUID,
  "storeStableId" TEXT,
  "providerMerchantRef" TEXT,
  "providerDocumentRef" TEXT,
  "periodStart" DATE,
  "periodEnd" DATE,
  "settledAt" TIMESTAMP(3),
  "payoutAt" TIMESTAMP(3),
  "currency" TEXT NOT NULL DEFAULT 'CAD',
  "parserName" TEXT NOT NULL,
  "parserVersion" TEXT NOT NULL,
  "rawMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountingProviderFinancialDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingProviderFinancialDocument_identity_check" CHECK (
    length(btrim("businessIdentityKey")) > 0
    AND length(btrim("parserName")) > 0
    AND length(btrim("parserVersion")) > 0
  ),
  CONSTRAINT "AccountingProviderFinancialDocument_revision_check" CHECK (
    (("revision" = 1 AND "supersedesDocumentId" IS NULL)
    OR ("revision" > 1 AND "supersedesDocumentId" IS NOT NULL))
    AND ("supersedesDocumentId" IS NULL OR "supersedesDocumentId" <> "id")
  ),
  CONSTRAINT "AccountingProviderFinancialDocument_period_check" CHECK (
    "periodStart" IS NULL OR "periodEnd" IS NULL OR "periodStart" <= "periodEnd"
  ),
  CONSTRAINT "AccountingProviderFinancialDocument_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "AccountingProviderFinancialLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lineStableId" TEXT NOT NULL,
  "documentId" UUID NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "externalRef" TEXT,
  "rawCode" TEXT,
  "rawName" TEXT,
  "component" "AccountingFinancialComponent" NOT NULL,
  "postingTreatment" "AccountingFinancialPostingTreatment" NOT NULL,
  "taxRole" "AccountingFinancialTaxRole" NOT NULL DEFAULT 'NONE',
  "amountCents" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountingProviderFinancialLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingProviderFinancialLine_line_no_check" CHECK ("lineNo" > 0)
);

CREATE TABLE "AccountingProviderFinancialCoverage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "coverageStableId" TEXT NOT NULL,
  "provider" "AccountingFinancialProvider" NOT NULL,
  "storeStableId" TEXT NOT NULL,
  "financialHistoryRequiredFrom" DATE NOT NULL,
  "financialCompleteThrough" DATE,
  "liveOrderFactCutoverAt" TIMESTAMP(3),
  "orderDetailCoverageFrom" DATE,
  "updatedByUserStableId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountingProviderFinancialCoverage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingProviderFinancialCoverage_store_check" CHECK (length(btrim("storeStableId")) > 0),
  CONSTRAINT "AccountingProviderFinancialCoverage_required_from_check" CHECK (
    "financialHistoryRequiredFrom" = DATE '2026-06-01'
  ),
  CONSTRAINT "AccountingProviderFinancialCoverage_complete_check" CHECK (
    "financialCompleteThrough" IS NULL OR "financialCompleteThrough" >= "financialHistoryRequiredFrom"
  )
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingSourceArtifact_artifactStableId_key" ON "AccountingSourceArtifact"("artifactStableId");
CREATE UNIQUE INDEX "AccountingSourceArtifact_acquisitionMode_transportIdentity_key" ON "AccountingSourceArtifact"("acquisitionMode", "transportIdentity");
CREATE INDEX "AccountingSourceArtifact_contentHash_createdAt_idx" ON "AccountingSourceArtifact"("contentHash", "createdAt");
CREATE INDEX "AccountingSourceArtifact_acquisitionMode_createdAt_idx" ON "AccountingSourceArtifact"("acquisitionMode", "createdAt");

CREATE UNIQUE INDEX "AccountingParseRun_parseRunStableId_key" ON "AccountingParseRun"("parseRunStableId");
CREATE UNIQUE INDEX "AccountingParseRun_idempotencyKey_key" ON "AccountingParseRun"("idempotencyKey");
CREATE UNIQUE INDEX "AccountingParseRun_artifactId_parserName_parserVersion_key" ON "AccountingParseRun"("artifactId", "parserName", "parserVersion");
CREATE INDEX "AccountingParseRun_artifactId_createdAt_idx" ON "AccountingParseRun"("artifactId", "createdAt");
CREATE INDEX "AccountingParseRun_status_createdAt_idx" ON "AccountingParseRun"("status", "createdAt");

CREATE UNIQUE INDEX "AccountingInboxItem_inboxItemStableId_key" ON "AccountingInboxItem"("inboxItemStableId");
CREATE UNIQUE INDEX "AccountingInboxItem_artifactId_key" ON "AccountingInboxItem"("artifactId");
CREATE INDEX "AccountingInboxItem_status_createdAt_idx" ON "AccountingInboxItem"("status", "createdAt");
CREATE INDEX "AccountingInboxItem_classification_status_createdAt_idx" ON "AccountingInboxItem"("classification", "status", "createdAt");
CREATE INDEX "AccountingInboxItem_duplicateOfArtifactId_idx" ON "AccountingInboxItem"("duplicateOfArtifactId");
CREATE INDEX "AcctInbox_materialized_idx" ON "AccountingInboxItem"("materializedEntityType", "materializedEntityStableId");

CREATE UNIQUE INDEX "AccountingTrustedSender_trustedSenderStableId_key" ON "AccountingTrustedSender"("trustedSenderStableId");
CREATE UNIQUE INDEX "AccountingTrustedSender_email_key" ON "AccountingTrustedSender"("email");
CREATE INDEX "AccountingTrustedSender_isActive_email_idx" ON "AccountingTrustedSender"("isActive", "email");

CREATE UNIQUE INDEX "AccountingProviderFinancialDocument_documentStableId_key" ON "AccountingProviderFinancialDocument"("documentStableId");
CREATE UNIQUE INDEX "AcctProviderFinDoc_identity_rev_key" ON "AccountingProviderFinancialDocument"("provider", "documentType", "businessIdentityKey", "revision");
CREATE UNIQUE INDEX "AccountingProviderFinancialDocument_artifactId_key" ON "AccountingProviderFinancialDocument"("artifactId");
CREATE INDEX "AcctProviderFinDoc_period_idx" ON "AccountingProviderFinancialDocument"("provider", "documentType", "periodStart", "periodEnd");
CREATE INDEX "AcctProviderFinDoc_store_period_idx" ON "AccountingProviderFinancialDocument"("storeStableId", "provider", "periodEnd");
CREATE INDEX "AccountingProviderFinancialDocument_supersedesDocumentId_idx" ON "AccountingProviderFinancialDocument"("supersedesDocumentId");

CREATE UNIQUE INDEX "AccountingProviderFinancialLine_lineStableId_key" ON "AccountingProviderFinancialLine"("lineStableId");
CREATE UNIQUE INDEX "AccountingProviderFinancialLine_documentId_lineNo_key" ON "AccountingProviderFinancialLine"("documentId", "lineNo");
CREATE INDEX "AccountingProviderFinancialLine_component_postingTreatment_idx" ON "AccountingProviderFinancialLine"("component", "postingTreatment");
CREATE INDEX "AccountingProviderFinancialLine_occurredAt_idx" ON "AccountingProviderFinancialLine"("occurredAt");

CREATE UNIQUE INDEX "AccountingProviderFinancialCoverage_coverageStableId_key" ON "AccountingProviderFinancialCoverage"("coverageStableId");
CREATE UNIQUE INDEX "AccountingProviderFinancialCoverage_provider_storeStableId_key" ON "AccountingProviderFinancialCoverage"("provider", "storeStableId");
CREATE INDEX "AccountingProviderFinancialCoverage_storeStableId_provider_idx" ON "AccountingProviderFinancialCoverage"("storeStableId", "provider");

-- AddForeignKey
ALTER TABLE "AccountingParseRun" ADD CONSTRAINT "AccountingParseRun_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AccountingSourceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingInboxItem" ADD CONSTRAINT "AccountingInboxItem_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AccountingSourceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingInboxItem" ADD CONSTRAINT "AccountingInboxItem_duplicateOfArtifactId_fkey" FOREIGN KEY ("duplicateOfArtifactId") REFERENCES "AccountingSourceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingProviderFinancialDocument" ADD CONSTRAINT "AccountingProviderFinancialDocument_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AccountingSourceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingProviderFinancialDocument" ADD CONSTRAINT "AccountingProviderFinancialDocument_supersedesDocumentId_fkey" FOREIGN KEY ("supersedesDocumentId") REFERENCES "AccountingProviderFinancialDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountingProviderFinancialLine" ADD CONSTRAINT "AccountingProviderFinancialLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountingProviderFinancialDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
