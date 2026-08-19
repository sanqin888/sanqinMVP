-- Scheduled fulfillment is independent from the existing production lifecycle status.
CREATE TYPE "OrderFulfillmentTiming" AS ENUM ('IMMEDIATE', 'SCHEDULED');

ALTER TABLE "Order"
ADD COLUMN "fulfillmentTiming" "OrderFulfillmentTiming" NOT NULL DEFAULT 'IMMEDIATE',
ADD COLUMN "scheduledReadyAt" TIMESTAMP(3),
ADD COLUMN "prepStartAt" TIMESTAMP(3),
ADD COLUMN "prepDurationMinutes" INTEGER,
ADD COLUMN "scheduleActivatedAt" TIMESTAMP(3);

-- Mirrors the durable scheduler predicate: unactivated scheduled work ordered by prep start.
CREATE INDEX "Order_fulfillmentTiming_scheduleActivatedAt_prepStartAt_status_idx"
ON "Order"("fulfillmentTiming", "scheduleActivatedAt", "prepStartAt", "status");
