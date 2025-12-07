-- DropIndex
DROP INDEX "public"."PhoneVerification_phone_status_createdAt_idx";

-- AlterTable
ALTER TABLE "PhoneVerification" ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'generic',
ADD COLUMN     "used" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PhoneVerification_phone_purpose_used_createdAt_idx" ON "PhoneVerification"("phone", "purpose", "used", "createdAt");
