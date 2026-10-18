-- CreateTable
CREATE TABLE "PaymentExceptionCase" (
    "caseStableId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "storeStableId" TEXT NOT NULL,
    "paymentTransactionId" UUID NOT NULL,
    "externalPaymentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestedByStableId" TEXT NOT NULL,
    "operatorNote" TEXT NOT NULL,
    "cloverOrderId" TEXT,
    "approvedByStableId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentExceptionCase_pkey" PRIMARY KEY ("caseStableId")
);

-- CreateTable
CREATE TABLE "PaymentExceptionEvidence" (
    "id" UUID NOT NULL,
    "caseStableId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "resultCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentExceptionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentExceptionApproval" (
    "id" UUID NOT NULL,
    "caseStableId" TEXT NOT NULL,
    "actorStableId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentExceptionApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentExceptionExecution" (
    "caseStableId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "finishedAt" TIMESTAMP(3),
    "failureCode" TEXT,

    CONSTRAINT "PaymentExceptionExecution_pkey" PRIMARY KEY ("caseStableId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentExceptionCase_attemptId_key" ON "PaymentExceptionCase"("attemptId");

-- CreateIndex
CREATE INDEX "PaymentExceptionCase_storeStableId_status_updatedAt_idx" ON "PaymentExceptionCase"("storeStableId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "PaymentExceptionCase_status_updatedAt_idx" ON "PaymentExceptionCase"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "PaymentExceptionEvidence_caseStableId_createdAt_idx" ON "PaymentExceptionEvidence"("caseStableId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentExceptionApproval_caseStableId_key" ON "PaymentExceptionApproval"("caseStableId");

-- CreateIndex
CREATE INDEX "PaymentExceptionApproval_actorStableId_decidedAt_idx" ON "PaymentExceptionApproval"("actorStableId", "decidedAt");

-- CreateIndex
CREATE INDEX "PaymentExceptionExecution_finishedAt_lastAttemptAt_idx" ON "PaymentExceptionExecution"("finishedAt", "lastAttemptAt");
