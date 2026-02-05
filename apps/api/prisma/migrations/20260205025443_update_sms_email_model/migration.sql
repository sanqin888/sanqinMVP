/*
  Warnings:

  - You are about to drop the `EmailVerification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PasswordResetToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PhoneVerification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TwoFactorChallenge` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `templateType` on the `MessagingSend` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "MessagingDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "MessagingTemplateType" AS ENUM ('OTP', 'SIGNUP_WELCOME', 'SUBSCRIPTION_CONFIRM', 'ORDER_READY', 'RECEIPT', 'EMAIL_VERIFY_LINK', 'PASSWORD_RESET_LINK');

-- CreateEnum
CREATE TYPE "AuthChallengeType" AS ENUM ('EMAIL_VERIFY', 'PHONE_VERIFY', 'TWO_FACTOR', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "AuthChallengeStatus" AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED', 'REVOKED');

-- DropForeignKey
ALTER TABLE "EmailVerification" DROP CONSTRAINT "EmailVerification_userId_fkey";

-- DropForeignKey
ALTER TABLE "PasswordResetToken" DROP CONSTRAINT "PasswordResetToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "TwoFactorChallenge" DROP CONSTRAINT "TwoFactorChallenge_userId_fkey";

-- AlterTable
ALTER TABLE "MessagingDeliveryEvent" ADD COLUMN     "webhookEventId" UUID;

-- AlterTable
ALTER TABLE "MessagingSend" ADD COLUMN     "direction" "MessagingDirection" NOT NULL DEFAULT 'OUTBOUND',
ADD COLUMN     "orderId" UUID,
DROP COLUMN "templateType",
ADD COLUMN     "templateType" "MessagingTemplateType" NOT NULL;

-- DropTable
DROP TABLE "EmailVerification";

-- DropTable
DROP TABLE "PasswordResetToken";

-- DropTable
DROP TABLE "PhoneVerification";

-- DropTable
DROP TABLE "TwoFactorChallenge";

-- DropEnum
DROP TYPE "PhoneVerificationStatus";

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "type" "AuthChallengeType" NOT NULL,
    "status" "AuthChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "MessagingChannel" NOT NULL,
    "addressNorm" TEXT NOT NULL,
    "addressRaw" TEXT,
    "codeHash" TEXT,
    "tokenHash" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'generic',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "ip" TEXT,
    "userAgent" TEXT,
    "messagingSendId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthChallenge_userId_type_createdAt_idx" ON "AuthChallenge"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AuthChallenge_channel_addressNorm_expiresAt_idx" ON "AuthChallenge"("channel", "addressNorm", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthChallenge_status_expiresAt_idx" ON "AuthChallenge"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "MessagingDeliveryEvent_webhookEventId_idx" ON "MessagingDeliveryEvent"("webhookEventId");

-- CreateIndex
CREATE INDEX "MessagingSend_orderId_idx" ON "MessagingSend"("orderId");

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_messagingSendId_fkey" FOREIGN KEY ("messagingSendId") REFERENCES "MessagingSend"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingDeliveryEvent" ADD CONSTRAINT "MessagingDeliveryEvent_webhookEventId_fkey" FOREIGN KEY ("webhookEventId") REFERENCES "MessagingWebhookEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
