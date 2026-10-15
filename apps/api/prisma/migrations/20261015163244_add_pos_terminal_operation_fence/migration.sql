-- CreateEnum
CREATE TYPE "PaymentTerminalOperationState" AS ENUM ('RESERVED', 'SALE_IN_FLIGHT', 'CANCEL_REQUESTED', 'CANCEL_ACKED', 'FINALIZED', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "PaymentTerminalOperation" (
    "terminalId" TEXT NOT NULL,
    "storeStableId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "paymentTransactionId" UUID,
    "externalPaymentId" TEXT,
    "state" "PaymentTerminalOperationState" NOT NULL DEFAULT 'RESERVED',
    "cancelRequestedAt" TIMESTAMP(3),
    "cancelAcknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTerminalOperation_pkey" PRIMARY KEY ("terminalId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTerminalOperation_attemptId_key" ON "PaymentTerminalOperation"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTerminalOperation_paymentTransactionId_key" ON "PaymentTerminalOperation"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "PaymentTerminalOperation_state_updatedAt_idx" ON "PaymentTerminalOperation"("state", "updatedAt");

-- CreateIndex
CREATE INDEX "PaymentTerminalOperation_storeStableId_state_idx" ON "PaymentTerminalOperation"("storeStableId", "state");
