-- CreateEnum
CREATE TYPE "EmailSuppressionReason" AS ENUM ('BOUNCE', 'COMPLAINT', 'MANUAL');

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT,
    "destinations" TEXT[],
    "mailTimestamp" TIMESTAMP(3),
    "feedbackId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "email" TEXT NOT NULL,
    "reason" "EmailSuppressionReason" NOT NULL DEFAULT 'BOUNCE',
    "sourceMessageId" TEXT,
    "feedbackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailEvent_idempotencyKey_key" ON "EmailEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EmailEvent_messageId_eventType_idx" ON "EmailEvent"("messageId", "eventType");

-- CreateIndex
CREATE INDEX "EmailEvent_createdAt_idx" ON "EmailEvent"("createdAt");

-- CreateIndex
CREATE INDEX "EmailSuppression_reason_updatedAt_idx" ON "EmailSuppression"("reason", "updatedAt");
