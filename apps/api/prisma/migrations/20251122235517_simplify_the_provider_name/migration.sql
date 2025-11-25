/*
  Warnings:

  - The values [DOORDASH_DRIVE,UBER_DIRECT] on the enum `DeliveryProvider` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "DeliveryProvider_new" AS ENUM ('DOORDASH', 'UBER');
ALTER TABLE "Order" ALTER COLUMN "deliveryProvider" TYPE "DeliveryProvider_new" USING ("deliveryProvider"::text::"DeliveryProvider_new");
ALTER TYPE "DeliveryProvider" RENAME TO "DeliveryProvider_old";
ALTER TYPE "DeliveryProvider_new" RENAME TO "DeliveryProvider";
DROP TYPE "public"."DeliveryProvider_old";
COMMIT;
