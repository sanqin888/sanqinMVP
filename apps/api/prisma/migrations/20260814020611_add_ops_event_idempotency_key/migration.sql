/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `OpsEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "OpsEvent" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OpsEvent_idempotencyKey_key" ON "OpsEvent"("idempotencyKey");
