-- AlterTable
ALTER TABLE "User" ADD COLUMN     "marketingEmailOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingEmailOptInAt" TIMESTAMP(3);
