/*
  Warnings:

  - Added the required column `nonPeriodicCppAdditionalDeductionYtdCents` to the `PayrollEmployeeYearOpening` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nonPeriodicCppBaseContributionYtdCents` to the `PayrollEmployeeYearOpening` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nonPeriodicEiPremiumYtdCents` to the `PayrollEmployeeYearOpening` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PayrollEmployeeYearOpening" ADD COLUMN     "nonPeriodicCppAdditionalDeductionYtdCents" INTEGER NOT NULL,
ADD COLUMN     "nonPeriodicCppBaseContributionYtdCents" INTEGER NOT NULL,
ADD COLUMN     "nonPeriodicEiPremiumYtdCents" INTEGER NOT NULL;
