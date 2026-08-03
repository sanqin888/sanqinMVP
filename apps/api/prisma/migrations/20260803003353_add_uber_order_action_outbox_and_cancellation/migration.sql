-- AlterTable
ALTER TABLE "UberOrderAction" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "uberRequestId" TEXT;

-- CreateTable
CREATE TABLE "UberOrderCancellation" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cancelledBy" TEXT,
    "reasonCode" TEXT,
    "reasonDetail" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UberOrderCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UberOrderCancellation_eventId_key" ON "UberOrderCancellation"("eventId");

-- CreateIndex
CREATE INDEX "UberOrderCancellation_orderId_occurredAt_idx" ON "UberOrderCancellation"("orderId", "occurredAt");

-- CreateIndex
CREATE INDEX "UberOrderCancellation_externalOrderId_occurredAt_idx" ON "UberOrderCancellation"("externalOrderId", "occurredAt");

-- AddForeignKey
ALTER TABLE "UberOrderCancellation" ADD CONSTRAINT "UberOrderCancellation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
