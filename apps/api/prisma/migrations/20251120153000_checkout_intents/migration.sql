-- CreateTable
CREATE TABLE "CheckoutIntent" (
    "id" UUID NOT NULL,
    "referenceId" TEXT NOT NULL,
    "checkoutSessionId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "locale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "orderId" UUID,
    "metadataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIntent_checkoutSessionId_key"
  ON "CheckoutIntent"("checkoutSessionId")
  WHERE "checkoutSessionId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "CheckoutIntent_referenceId_createdAt_idx"
  ON "CheckoutIntent"("referenceId", "createdAt");
