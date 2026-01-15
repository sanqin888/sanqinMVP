-- CreateEnum
CREATE TYPE "UserLanguage" AS ENUM ('ZH', 'EN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "language" "UserLanguage" NOT NULL DEFAULT 'ZH';
