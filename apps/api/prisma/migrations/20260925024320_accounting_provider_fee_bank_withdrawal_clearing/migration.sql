-- CreateEnum
CREATE TYPE "AccountingProviderFeeBankRowDecisionKind" AS ENUM ('EXCLUDED', 'READY_FOR_CLEARING', 'CLEARED');

-- CreateTable
CREATE TABLE "AccountingProviderFeeBankRowDecision" (
    "id" UUID NOT NULL,
    "decisionStableId" TEXT NOT NULL,
    "artifactId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rowFingerprint" TEXT NOT NULL,
    "storeStableId" TEXT NOT NULL,
    "bankAccountStableId" TEXT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT,
    "providerHint" "AccountingFinancialProvider",
    "decision" "AccountingProviderFeeBankRowDecisionKind" NOT NULL,
    "journalEntryStableId" TEXT,
    "confirmedByActorRef" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingProviderFeeBankRowDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingProviderFeeBankRowDecision_decisionStableId_key" ON "AccountingProviderFeeBankRowDecision"("decisionStableId");

-- CreateIndex
CREATE INDEX "AccountingProviderFeeBankRowDecision_artifactId_storeStable_idx" ON "AccountingProviderFeeBankRowDecision"("artifactId", "storeStableId", "bankAccountStableId");

-- CreateIndex
CREATE INDEX "AccountingProviderFeeBankRowDecision_decision_confirmedAt_idx" ON "AccountingProviderFeeBankRowDecision"("decision", "confirmedAt");

-- CreateIndex
CREATE INDEX "AccountingProviderFeeBankRowDecision_journalEntryStableId_idx" ON "AccountingProviderFeeBankRowDecision"("journalEntryStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingProviderFeeBankRowDecision_scope_key" ON "AccountingProviderFeeBankRowDecision"("artifactId", "rowNumber", "storeStableId", "bankAccountStableId");

-- AddForeignKey
ALTER TABLE "AccountingProviderFeeBankRowDecision" ADD CONSTRAINT "AccountingProviderFeeBankRowDecision_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AccountingSourceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
