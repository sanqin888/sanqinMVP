-- AlterTable
ALTER TABLE "PaymentCheckoutAttempt" ADD COLUMN     "benefitsReleasedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PaymentCheckoutAttempt_source_status_benefitsReleasedAt_idx" ON "PaymentCheckoutAttempt"("source", "status", "benefitsReleasedAt");
