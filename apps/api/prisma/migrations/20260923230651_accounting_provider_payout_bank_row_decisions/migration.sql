-- CreateEnum
CREATE TYPE "AccountingProviderPayoutBankRowDecisionKind" AS ENUM ('EXCLUDED', 'READY_FOR_POSTING', 'MATCH_EXISTING_PAYOUT');

-- CreateTable
CREATE TABLE "AccountingProviderPayoutBankRowDecision" (
    "id" UUID NOT NULL,
    "decisionStableId" TEXT NOT NULL,
    "artifactId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rowFingerprint" TEXT NOT NULL,
    "storeStableId" TEXT NOT NULL,
    "destinationBankAccountStableId" TEXT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT,
    "providerHint" "AccountingFinancialProvider",
    "decision" "AccountingProviderPayoutBankRowDecisionKind" NOT NULL,
    "matchedPayoutStableId" TEXT,
    "confirmedByActorRef" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingProviderPayoutBankRowDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingProviderPayoutBankRowDecision_decisionStableId_key" ON "AccountingProviderPayoutBankRowDecision"("decisionStableId");

-- CreateIndex
CREATE INDEX "AccountingProviderPayoutBankRowDecision_artifactId_storeSta_idx" ON "AccountingProviderPayoutBankRowDecision"("artifactId", "storeStableId", "destinationBankAccountStableId");

-- CreateIndex
CREATE INDEX "AccountingProviderPayoutBankRowDecision_decision_confirmedA_idx" ON "AccountingProviderPayoutBankRowDecision"("decision", "confirmedAt");

-- CreateIndex
CREATE INDEX "AccountingProviderPayoutBankRowDecision_matchedPayoutStable_idx" ON "AccountingProviderPayoutBankRowDecision"("matchedPayoutStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingProviderPayoutBankRowDecision_scope_key" ON "AccountingProviderPayoutBankRowDecision"("artifactId", "rowNumber", "storeStableId", "destinationBankAccountStableId");

-- AddForeignKey
ALTER TABLE "AccountingProviderPayoutBankRowDecision" ADD CONSTRAINT "AccountingProviderPayoutBankRowDecision_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AccountingSourceArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingProviderPayoutBankRowDecision" ADD CONSTRAINT "AccountingProviderPayoutBankRowDecision_matchedPayoutStabl_fkey" FOREIGN KEY ("matchedPayoutStableId") REFERENCES "AccountingProviderPayout"("payoutStableId") ON DELETE RESTRICT ON UPDATE CASCADE;
