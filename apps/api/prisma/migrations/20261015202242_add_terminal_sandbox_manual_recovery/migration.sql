-- CreateTable
CREATE TABLE "PaymentTerminalSandboxRecovery" (
    "attemptId" TEXT NOT NULL,
    "paymentTransactionId" UUID NOT NULL,
    "terminalId" TEXT NOT NULL,
    "storeStableId" TEXT NOT NULL,
    "externalPaymentId" TEXT NOT NULL,
    "actorUserStableId" TEXT NOT NULL,
    "cloverOrderId" TEXT NOT NULL,
    "operatorNote" TEXT NOT NULL,
    "originalResultCode" TEXT NOT NULL,
    "originalFailureCode" TEXT NOT NULL,
    "canonicalCheckedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "benefitsReleasedAt" TIMESTAMP(3),
    "terminalFinalizedAt" TIMESTAMP(3),
    "lateCanonicalAt" TIMESTAMP(3),
    "lateProviderPaymentId" TEXT,

    CONSTRAINT "PaymentTerminalSandboxRecovery_pkey" PRIMARY KEY ("attemptId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTerminalSandboxRecovery_paymentTransactionId_key" ON "PaymentTerminalSandboxRecovery"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "PaymentTerminalSandboxRecovery_storeStableId_acceptedAt_idx" ON "PaymentTerminalSandboxRecovery"("storeStableId", "acceptedAt");

-- CreateIndex
CREATE INDEX "PaymentTerminalSandboxRecovery_terminalId_acceptedAt_idx" ON "PaymentTerminalSandboxRecovery"("terminalId", "acceptedAt");
