-- CreateTable
CREATE TABLE "AccountingProviderPayout" (
    "id" UUID NOT NULL,
    "payoutStableId" TEXT NOT NULL,
    "provider" "AccountingFinancialProvider" NOT NULL,
    "storeStableId" TEXT NOT NULL,
    "payoutDate" DATE NOT NULL,
    "destinationBankAccountStableId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "providerReference" TEXT,
    "journalEntryStableId" TEXT,
    "createdByActorRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingProviderPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingProviderPayout_payoutStableId_key" ON "AccountingProviderPayout"("payoutStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingProviderPayout_journalEntryStableId_key" ON "AccountingProviderPayout"("journalEntryStableId");

-- CreateIndex
CREATE INDEX "AccountingProviderPayout_provider_payoutDate_idx" ON "AccountingProviderPayout"("provider", "payoutDate");

-- CreateIndex
CREATE INDEX "AccountingProviderPayout_storeStableId_payoutDate_idx" ON "AccountingProviderPayout"("storeStableId", "payoutDate");

-- CreateIndex
CREATE INDEX "AccountingProviderPayout_destinationBankAccountStableId_pay_idx" ON "AccountingProviderPayout"("destinationBankAccountStableId", "payoutDate");

-- CreateIndex
CREATE INDEX "AccountingProviderPayout_provider_providerReference_idx" ON "AccountingProviderPayout"("provider", "providerReference");
