/*
  Warnings:

  - You are about to drop the column `operatorUserId` on the `AccountingAuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `confirmedByUserId` on the `AccountingExpenseDocument` table. All the data in the column will be lost.
  - You are about to drop the column `createdByUserStableId` on the `AccountingJournalEntry` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByUserStableId` on the `AccountingJournalEntry` table. All the data in the column will be lost.
  - You are about to drop the column `closedByUserId` on the `AccountingPeriodClose` table. All the data in the column will be lost.
  - You are about to drop the column `createdByUserId` on the `AccountingTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `updatedByUserId` on the `AccountingTransaction` table. All the data in the column will be lost.
  - Added the required column `operatorActorRef` to the `AccountingAuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdByActorRef` to the `AccountingJournalEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedByActorRef` to the `AccountingJournalEntry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `closedByUserStableId` to the `AccountingPeriodClose` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdByUserStableId` to the `AccountingTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedByUserStableId` to the `AccountingTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "AccountingAuditLog_operatorUserId_createdAt_idx";

-- AlterTable
ALTER TABLE "AccountingAuditLog" DROP COLUMN "operatorUserId",
ADD COLUMN     "operatorActorRef" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "AccountingExpenseDocument" DROP COLUMN "confirmedByUserId",
ADD COLUMN     "confirmedByUserStableId" TEXT;

-- AlterTable
ALTER TABLE "AccountingJournalEntry" DROP COLUMN "createdByUserStableId",
DROP COLUMN "updatedByUserStableId",
ADD COLUMN     "createdByActorRef" TEXT NOT NULL,
ADD COLUMN     "updatedByActorRef" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "AccountingPeriodClose" DROP COLUMN "closedByUserId",
ADD COLUMN     "closedByUserStableId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "AccountingTransaction" DROP COLUMN "createdByUserId",
DROP COLUMN "updatedByUserId",
ADD COLUMN     "createdByUserStableId" TEXT NOT NULL,
ADD COLUMN     "updatedByUserStableId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "AccountingAuditLog_operatorActorRef_createdAt_idx" ON "AccountingAuditLog"("operatorActorRef", "createdAt");
