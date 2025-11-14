-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('STANDARD', 'PRIORITY');

-- CreateEnum
CREATE TYPE "DeliveryProvider" AS ENUM ('DOORDASH_DRIVE', 'UBER_DIRECT');

-- AlterTable
ALTER TABLE "Order"
  ADD COLUMN     "deliveryType" "DeliveryType",
  ADD COLUMN     "deliveryProvider" "DeliveryProvider",
  ADD COLUMN     "deliveryFeeCents" INTEGER,
  ADD COLUMN     "deliveryEtaMinMinutes" INTEGER,
  ADD COLUMN     "deliveryEtaMaxMinutes" INTEGER,
  ADD COLUMN     "externalDeliveryId" TEXT;
