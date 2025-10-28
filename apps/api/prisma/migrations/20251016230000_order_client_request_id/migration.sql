ALTER TABLE "Order"
  ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "Order_clientRequestId_key"
  ON "Order"("clientRequestId")
  WHERE "clientRequestId" IS NOT NULL;
