/*
  Warnings:

  - You are about to drop the `AccountingTransaction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AccountingTransaction" DROP CONSTRAINT "AccountingTransaction_accountId_fkey";

-- DropForeignKey
ALTER TABLE "AccountingTransaction" DROP CONSTRAINT "AccountingTransaction_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "AccountingTransaction" DROP CONSTRAINT "AccountingTransaction_documentId_fkey";

-- DropForeignKey
ALTER TABLE "AccountingTransaction" DROP CONSTRAINT "AccountingTransaction_toAccountId_fkey";

-- DropTable
DROP TABLE "AccountingTransaction";

-- DropEnum
DROP TYPE "AccountingSourceType";
