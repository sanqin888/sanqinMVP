-- CreateEnum
CREATE TYPE "AllergyHandlingMode" AS ENUM ('RELAY_ALL', 'DENY_LIST', 'DENY_ALL');

-- AlterTable
ALTER TABLE "StoreConfig" ADD COLUMN     "allergyHandlingMode" "AllergyHandlingMode" NOT NULL DEFAULT 'RELAY_ALL',
ADD COLUMN     "unsupportedAllergens" TEXT[] DEFAULT ARRAY[]::TEXT[];
