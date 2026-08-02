/*
  Warnings:

  - The values [SUCCESS,PENDING,IN_PROGRESS,PARTIAL_SUCCESS] on the enum `UberMenuPublishStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "UberMenuPublishStatus_new" AS ENUM ('SUBMITTED', 'SUCCEEDED', 'FAILED');
ALTER TABLE "public"."UberMenuPublishVersion" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "UberMenuPublishVersion" ALTER COLUMN "status" TYPE "UberMenuPublishStatus_new" USING ("status"::text::"UberMenuPublishStatus_new");
ALTER TYPE "UberMenuPublishStatus" RENAME TO "UberMenuPublishStatus_old";
ALTER TYPE "UberMenuPublishStatus_new" RENAME TO "UberMenuPublishStatus";
DROP TYPE "public"."UberMenuPublishStatus_old";
ALTER TABLE "UberMenuPublishVersion" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';
COMMIT;

-- AlterTable
ALTER TABLE "UberMenuPublishVersion" ADD COLUMN     "errorDetails" JSONB,
ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';
