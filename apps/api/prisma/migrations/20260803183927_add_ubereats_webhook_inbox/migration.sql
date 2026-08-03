-- AlterTable
ALTER TABLE "UberWebhookInbox" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "errorSummary" TEXT,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "processingAt" TIMESTAMP(3);
