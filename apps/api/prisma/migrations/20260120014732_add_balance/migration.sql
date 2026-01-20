-- CreateEnum
CREATE TYPE "LoyaltyTarget" AS ENUM ('POINTS', 'BALANCE');

-- AlterTable
ALTER TABLE "LoyaltyAccount" ADD COLUMN     "balanceMicro" BIGINT NOT NULL DEFAULT 0,
ALTER COLUMN "pointsMicro" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "LoyaltyLedger" ADD COLUMN     "target" "LoyaltyTarget" NOT NULL DEFAULT 'POINTS';
