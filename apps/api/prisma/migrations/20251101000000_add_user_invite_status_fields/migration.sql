/*
  Warnings:

  - Added the required columns `sentCount` to the `UserInvite` table. This will be set to 0 for existing rows.
*/

ALTER TABLE "UserInvite"
ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "sentCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastSentAt" TIMESTAMP(3);
