-- CreateTable
CREATE TABLE "OpsEvent" (
    "id" UUID NOT NULL,
    "eventName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpsEvent_source_eventName_occurredAt_idx" ON "OpsEvent"("source", "eventName", "occurredAt");

-- CreateIndex
CREATE INDEX "OpsEvent_occurredAt_idx" ON "OpsEvent"("occurredAt");
