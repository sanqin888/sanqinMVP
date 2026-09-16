-- CreateEnum
CREATE TYPE "AccountingArtifactBinaryRetentionState" AS ENUM ('ORIGINAL_PRESENT', 'CANDIDATE_READY', 'PURGE_PENDING', 'COMPRESSED_ONLY');

-- CreateEnum
CREATE TYPE "AccountingProviderRecognitionMatchMode" AS ENUM ('ANY', 'ALL');

-- CreateTable
CREATE TABLE "AccountingArtifactBinaryRetention" (
    "id" UUID NOT NULL,
    "artifactId" UUID NOT NULL,
    "state" "AccountingArtifactBinaryRetentionState" NOT NULL DEFAULT 'ORIGINAL_PRESENT',
    "originalWidth" INTEGER,
    "originalHeight" INTEGER,
    "candidateStoredUrl" TEXT,
    "candidateContentHash" TEXT,
    "candidateByteSize" INTEGER,
    "candidateMimeType" TEXT,
    "candidateWidth" INTEGER,
    "candidateHeight" INTEGER,
    "candidateProfile" TEXT,
    "candidateMaxDimension" INTEGER,
    "candidateQuality" INTEGER,
    "retainedStoredUrl" TEXT,
    "retainedContentHash" TEXT,
    "retainedByteSize" INTEGER,
    "retainedMimeType" TEXT,
    "retainedWidth" INTEGER,
    "retainedHeight" INTEGER,
    "retainedProfile" TEXT,
    "retainedMaxDimension" INTEGER,
    "retainedQuality" INTEGER,
    "compressionPolicyVersion" INTEGER,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserStableId" TEXT,
    "originalPurgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingArtifactBinaryRetention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingProviderRecognitionRule" (
    "id" UUID NOT NULL,
    "ruleStableId" TEXT NOT NULL,
    "provider" "AccountingFinancialProvider" NOT NULL,
    "documentType" "AccountingFinancialDocumentType" NOT NULL,
    "requiredKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optionalKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optionalMatchMode" "AccountingProviderRecognitionMatchMode" NOT NULL DEFAULT 'ANY',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserStableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingProviderRecognitionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingArtifactBinaryRetention_artifactId_key" ON "AccountingArtifactBinaryRetention"("artifactId");

-- CreateIndex
CREATE INDEX "AccountingArtifactBinaryRetention_state_updatedAt_idx" ON "AccountingArtifactBinaryRetention"("state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingProviderRecognitionRule_ruleStableId_key" ON "AccountingProviderRecognitionRule"("ruleStableId");

-- CreateIndex
CREATE INDEX "AccountingProviderRecognitionRule_isActive_priority_idx" ON "AccountingProviderRecognitionRule"("isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingProviderRecognitionRule_provider_documentType_key" ON "AccountingProviderRecognitionRule"("provider", "documentType");

-- AddForeignKey
ALTER TABLE "AccountingArtifactBinaryRetention" ADD CONSTRAINT "AccountingArtifactBinaryRetention_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AccountingSourceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
