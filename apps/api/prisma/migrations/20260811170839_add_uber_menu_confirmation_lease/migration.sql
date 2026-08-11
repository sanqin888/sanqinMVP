/*
  Warnings:

  - A unique constraint covering the columns `[confirmationLeaseToken]` on the table `UberMenuPublishVersion` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "UberMenuPublishVersion_status_createdAt_idx";

-- AlterTable
ALTER TABLE "UberMenuPublishVersion" ADD COLUMN     "confirmationLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "confirmationLeaseToken" TEXT,
ADD COLUMN     "nextConfirmationAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "UberMenuPublishVersion_confirmationLeaseToken_key" ON "UberMenuPublishVersion"("confirmationLeaseToken");

-- CreateIndex
CREATE INDEX "UberMenuPublishVersion_status_nextConfirmationAt_confirmati_idx" ON "UberMenuPublishVersion"("status", "nextConfirmationAt", "confirmationLeaseExpiresAt", "createdAt");
