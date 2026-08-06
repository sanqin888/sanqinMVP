-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "storeId" TEXT;

-- CreateTable
CREATE TABLE "PosPrintJob" (
    "id" UUID NOT NULL,
    "jobId" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "orderStableId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'AUTO',
    "payload" JSONB NOT NULL,
    "customerRequested" BOOLEAN NOT NULL DEFAULT true,
    "kitchenRequested" BOOLEAN NOT NULL DEFAULT true,
    "customerStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "kitchenStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "customerAttempts" INTEGER NOT NULL DEFAULT 0,
    "kitchenAttempts" INTEGER NOT NULL DEFAULT 0,
    "customerFailureReason" TEXT,
    "kitchenFailureReason" TEXT,
    "customerCompletedAt" TIMESTAMP(3),
    "kitchenCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosPrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosPrintJob_jobId_key" ON "PosPrintJob"("jobId");

-- CreateIndex
CREATE INDEX "PosPrintJob_storeId_customerStatus_kitchenStatus_idx" ON "PosPrintJob"("storeId", "customerStatus", "kitchenStatus");

-- CreateIndex
CREATE INDEX "PosPrintJob_orderStableId_createdAt_idx" ON "PosPrintJob"("orderStableId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PosPrintJob_orderStableId_kind_key" ON "PosPrintJob"("orderStableId", "kind");

-- AddForeignKey
ALTER TABLE "PosPrintJob" ADD CONSTRAINT "PosPrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
