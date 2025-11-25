/*
  Warnings:

  - A unique constraint covering the columns `[referenceId]` on the table `CheckoutIntent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[checkoutSessionId]` on the table `CheckoutIntent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[clientRequestId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
*/

-- CreateTable
CREATE TABLE "CheckoutIntent" (
  "id" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "checkoutSessionId" TEXT,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CheckoutIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIntent_referenceId_key"
  ON "CheckoutIntent"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIntent_checkoutSessionId_key"
  ON "CheckoutIntent"("checkoutSessionId");

