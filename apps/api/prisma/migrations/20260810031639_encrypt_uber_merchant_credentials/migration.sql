/*
  Warnings:

  - A unique constraint covering the columns `[leaseToken]` on the table `UberOrderAction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[leaseToken]` on the table `UberWebhookInbox` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "UberOrderAction_status_retryable_updatedAt_idx";

-- DropIndex
DROP INDEX "UberWebhookInbox_status_createdAt_idx";

-- AlterTable
ALTER TABLE "UberMerchantConnection" ADD COLUMN     "encryptedAccessToken" TEXT,
ADD COLUMN     "encryptedRefreshToken" TEXT,
ALTER COLUMN "accessToken" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UberOrderAction" ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "leaseToken" TEXT,
ADD COLUMN     "nextRetryAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UberWebhookInbox" ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "leaseToken" TEXT,
ADD COLUMN     "structuredError" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "UberOrderAction_leaseToken_key" ON "UberOrderAction"("leaseToken");

-- CreateIndex
CREATE INDEX "UberOrderAction_status_retryable_nextRetryAt_updatedAt_idx" ON "UberOrderAction"("status", "retryable", "nextRetryAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UberWebhookInbox_leaseToken_key" ON "UberWebhookInbox"("leaseToken");

-- CreateIndex
CREATE INDEX "UberWebhookInbox_status_nextRetryAt_createdAt_idx" ON "UberWebhookInbox"("status", "nextRetryAt", "createdAt");
