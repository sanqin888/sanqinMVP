/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `UberMenuPublishVersion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[idempotencyKey]` on the table `UberOrderAction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[idempotencyKey]` on the table `UberWebhookInbox` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `action` on the `UberOrderAction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `UberOrderAction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `UberWebhookInbox` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "UberWebhookInboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "UberOrderActionType" AS ENUM ('ACCEPT', 'DENY', 'READY_FOR_PICKUP');

-- CreateEnum
CREATE TYPE "UberOrderActionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- DropIndex
DROP INDEX "UberOrderAction_status_retryable_nextRetryAt_updatedAt_idx";

-- DropIndex
DROP INDEX "UberWebhookInbox_status_nextRetryAt_createdAt_idx";

-- AlterTable
ALTER TABLE "UberMenuPublishVersion" ADD COLUMN     "businessVersion" TEXT NOT NULL DEFAULT 'v1',
ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "UberOAuthStateRequest" ADD COLUMN     "connectedAt" TIMESTAMP(3),
ADD COLUMN     "encryptedExchangeResult" TEXT,
ADD COLUMN     "lastErrorCategory" TEXT,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scope" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ISSUED',
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "tokenType" TEXT,
ADD COLUMN     "uberUserId" TEXT;

-- AlterTable
ALTER TABLE "UberOrderAction" ADD COLUMN     "businessVersion" TEXT NOT NULL DEFAULT 'v1',
ADD COLUMN     "idempotencyKey" TEXT,
DROP COLUMN "action",
ADD COLUMN     "action" "UberOrderActionType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "UberOrderActionStatus" NOT NULL;

-- AlterTable
ALTER TABLE "UberWebhookInbox" ADD COLUMN     "businessVersion" TEXT NOT NULL DEFAULT 'v1',
ADD COLUMN     "idempotencyKey" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "UberWebhookInboxStatus" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UberMenuPublishVersion_idempotencyKey_key" ON "UberMenuPublishVersion"("idempotencyKey");

-- CreateIndex
CREATE INDEX "UberOAuthStateRequest_status_expiresAt_idx" ON "UberOAuthStateRequest"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UberOrderAction_idempotencyKey_key" ON "UberOrderAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "UberOrderAction_status_retryable_nextRetryAt_leaseExpiresAt_idx" ON "UberOrderAction"("status", "retryable", "nextRetryAt", "leaseExpiresAt", "attemptCount", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UberOrderAction_externalOrderId_action_key" ON "UberOrderAction"("externalOrderId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "UberWebhookInbox_idempotencyKey_key" ON "UberWebhookInbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "UberWebhookInbox_status_nextRetryAt_leaseExpiresAt_attemptC_idx" ON "UberWebhookInbox"("status", "nextRetryAt", "leaseExpiresAt", "attemptCount", "createdAt");
