-- AlterTable
ALTER TABLE "AnalyticsEvent" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "creditCardSurchargeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentTotalCents" INTEGER NOT NULL DEFAULT 0;
