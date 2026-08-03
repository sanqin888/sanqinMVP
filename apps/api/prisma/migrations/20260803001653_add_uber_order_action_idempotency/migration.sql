-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "externalDisplayId" TEXT,
ADD COLUMN     "externalEstimatedReadyAt" TIMESTAMP(3),
ADD COLUMN     "externalOrderNotes" TEXT,
ADD COLUMN     "externalPriceVarianceCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "externalItemId" TEXT,
ADD COLUMN     "externalLineId" TEXT,
ADD COLUMN     "externalLineTotalCents" INTEGER,
ADD COLUMN     "externalSpecialInstructions" TEXT;

-- CreateTable
CREATE TABLE "UberOrderItemModifier" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "externalModifierId" TEXT,
    "parentExternalId" TEXT,
    "displayName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "specialInstructions" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB,

    CONSTRAINT "UberOrderItemModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UberWebhookInbox" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalOrderId" TEXT,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UberWebhookInbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UberOrderAction" (
    "id" UUID NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reasonCode" TEXT,
    "reasonDetail" TEXT,
    "uberHttpStatus" INTEGER,
    "response" JSONB,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UberOrderAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UberOrderItemModifier_orderItemId_sortOrder_idx" ON "UberOrderItemModifier"("orderItemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "UberWebhookInbox_eventId_key" ON "UberWebhookInbox"("eventId");

-- CreateIndex
CREATE INDEX "UberWebhookInbox_status_createdAt_idx" ON "UberWebhookInbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UberWebhookInbox_externalOrderId_idx" ON "UberWebhookInbox"("externalOrderId");

-- CreateIndex
CREATE INDEX "UberOrderAction_status_retryable_updatedAt_idx" ON "UberOrderAction"("status", "retryable", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UberOrderAction_externalOrderId_action_key" ON "UberOrderAction"("externalOrderId", "action");

-- AddForeignKey
ALTER TABLE "UberOrderItemModifier" ADD CONSTRAINT "UberOrderItemModifier_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
