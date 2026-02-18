/*
  Warnings:

  - The values [DOORDASH] on the enum `DeliveryProvider` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `enableDoorDash` on the `BusinessConfig` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "DeliveryProvider_new" AS ENUM ('UBER');
ALTER TABLE "Order" ALTER COLUMN "deliveryProvider" TYPE "DeliveryProvider_new" USING ("deliveryProvider"::text::"DeliveryProvider_new");
ALTER TYPE "DeliveryProvider" RENAME TO "DeliveryProvider_old";
ALTER TYPE "DeliveryProvider_new" RENAME TO "DeliveryProvider";
DROP TYPE "public"."DeliveryProvider_old";
COMMIT;

-- AlterTable
ALTER TABLE "BusinessConfig" DROP COLUMN "enableDoorDash";
