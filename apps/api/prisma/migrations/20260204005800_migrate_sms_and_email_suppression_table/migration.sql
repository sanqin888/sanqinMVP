/*
  Warnings:

  - You are about to drop the `EmailEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EmailSuppression` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MessagingChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "MessagingProvider" AS ENUM ('SENDGRID', 'AWS_SES', 'TWILIO', 'AWS_SMS', 'MANUAL');

-- CreateEnum
CREATE TYPE "MessagingSendStatus" AS ENUM ('QUEUED', 'ACCEPTED', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('BOUNCE_HARD', 'COMPLAINT', 'USER_OPT_OUT', 'INVALID_RECIPIENT', 'CARRIER_BLOCK', 'MANUAL');

-- DropTable
DROP TABLE "EmailEvent";

-- DropTable
DROP TABLE "EmailSuppression";

-- DropEnum
DROP TYPE "EmailSuppressionReason";

-- CreateTable
CREATE TABLE "MessagingSuppression" (
    "id" UUID NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "addressNorm" TEXT NOT NULL,
    "addressRaw" TEXT,
    "reason" "SuppressionReason" NOT NULL,
    "sourceProvider" "MessagingProvider",
    "sourceMessageId" TEXT,
    "feedbackId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "liftedAt" TIMESTAMP(3),

    CONSTRAINT "MessagingSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingSend" (
    "id" UUID NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "toAddressNorm" TEXT NOT NULL,
    "toAddressRaw" TEXT,
    "fromAddress" TEXT,
    "templateType" TEXT NOT NULL,
    "templateVersion" TEXT,
    "locale" "UserLanguage",
    "providerMessageId" TEXT,
    "statusLatest" "MessagingSendStatus" NOT NULL DEFAULT 'QUEUED',
    "errorCodeLatest" TEXT,
    "errorMessageLatest" TEXT,
    "metadata" JSONB,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingDeliveryEvent" (
    "id" UUID NOT NULL,
    "sendId" UUID,
    "channel" "MessagingChannel" NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "occurredAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingWebhookEvent" (
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "provider" "MessagingProvider" NOT NULL,
    "eventKind" TEXT NOT NULL,
    "requestUrl" TEXT,
    "headersJson" JSONB,
    "rawBody" TEXT,
    "paramsJson" JSONB,
    "remoteIp" TEXT,
    "providerMessageId" TEXT,
    "toAddressNorm" TEXT,
    "fromAddressNorm" TEXT,
    "occurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipientFailureCounter" (
    "id" UUID NOT NULL,
    "channel" "MessagingChannel" NOT NULL,
    "addressNorm" TEXT NOT NULL,
    "provider" "MessagingProvider",
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastFailedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipientFailureCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessagingSuppression_channel_reason_updatedAt_idx" ON "MessagingSuppression"("channel", "reason", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingSuppression_channel_addressNorm_key" ON "MessagingSuppression"("channel", "addressNorm");

-- CreateIndex
CREATE INDEX "MessagingSend_channel_toAddressNorm_createdAt_idx" ON "MessagingSend"("channel", "toAddressNorm", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingSend_provider_providerMessageId_idx" ON "MessagingSend"("provider", "providerMessageId");

-- CreateIndex
CREATE INDEX "MessagingSend_statusLatest_updatedAt_idx" ON "MessagingSend"("statusLatest", "updatedAt");

-- CreateIndex
CREATE INDEX "MessagingDeliveryEvent_provider_providerMessageId_createdAt_idx" ON "MessagingDeliveryEvent"("provider", "providerMessageId", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingDeliveryEvent_channel_eventType_createdAt_idx" ON "MessagingDeliveryEvent"("channel", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingDeliveryEvent_sendId_createdAt_idx" ON "MessagingDeliveryEvent"("sendId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingWebhookEvent_idempotencyKey_key" ON "MessagingWebhookEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MessagingWebhookEvent_provider_eventKind_createdAt_idx" ON "MessagingWebhookEvent"("provider", "eventKind", "createdAt");

-- CreateIndex
CREATE INDEX "MessagingWebhookEvent_providerMessageId_idx" ON "MessagingWebhookEvent"("providerMessageId");

-- CreateIndex
CREATE INDEX "RecipientFailureCounter_channel_failCount_updatedAt_idx" ON "RecipientFailureCounter"("channel", "failCount", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecipientFailureCounter_channel_addressNorm_key" ON "RecipientFailureCounter"("channel", "addressNorm");

-- AddForeignKey
ALTER TABLE "MessagingSend" ADD CONSTRAINT "MessagingSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingDeliveryEvent" ADD CONSTRAINT "MessagingDeliveryEvent_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "MessagingSend"("id") ON DELETE SET NULL ON UPDATE CASCADE;
