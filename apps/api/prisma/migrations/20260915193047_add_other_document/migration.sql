-- AlterEnum
ALTER TYPE "AccountingInboxClassification" ADD VALUE 'OTHER_DOCUMENT';

-- AlterTable
ALTER TABLE "AccountingInboxItem" ADD COLUMN     "selectedProvider" "AccountingFinancialProvider";
