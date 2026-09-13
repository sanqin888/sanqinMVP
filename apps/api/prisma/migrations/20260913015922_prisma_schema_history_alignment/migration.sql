-- AlterTable
ALTER TABLE "AccountingInboxItem" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AccountingJournalEntry" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AccountingJournalLine" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AccountingParseRun" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AccountingProviderFinancialCoverage" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AccountingProviderFinancialDocument" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AccountingProviderFinancialLine" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AccountingSourceArtifact" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AccountingTrustedSender" ALTER COLUMN "id" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "AccountingJournalEntry_source_sourceFactType_sourceFactStableId" RENAME TO "AccountingJournalEntry_source_sourceFactType_sourceFactStab_idx";
