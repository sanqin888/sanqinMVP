/*
  Warnings:

  - The values [ORDER,UBER,FANTUAN] on the enum `AccountingSourceType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `orderId` on the `AccountingTransaction` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AccountingSourceType_new" AS ENUM ('MANUAL', 'OTHER');
ALTER TABLE "AccountingTransaction" ALTER COLUMN "source" TYPE "AccountingSourceType_new" USING ("source"::text::"AccountingSourceType_new");
ALTER TYPE "AccountingSourceType" RENAME TO "AccountingSourceType_old";
ALTER TYPE "AccountingSourceType_new" RENAME TO "AccountingSourceType";
DROP TYPE "public"."AccountingSourceType_old";
COMMIT;

-- AlterTable
ALTER TABLE "AccountingTransaction" DROP COLUMN "orderId";
