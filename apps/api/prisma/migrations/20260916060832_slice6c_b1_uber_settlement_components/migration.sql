-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccountingFinancialComponent" ADD VALUE 'ADVERTISING_TAX';
ALTER TYPE "AccountingFinancialComponent" ADD VALUE 'CHARGEBACK_TAX';
ALTER TYPE "AccountingFinancialComponent" ADD VALUE 'PLATFORM_OTHER_FEE';
ALTER TYPE "AccountingFinancialComponent" ADD VALUE 'PLATFORM_OTHER_FEE_TAX';
