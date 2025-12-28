-- CreateEnum
CREATE TYPE "PosDeviceStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "PosDevice" (
    "id" UUID NOT NULL,
    "deviceStableId" TEXT NOT NULL,
    "storeId" UUID NOT NULL,
    "name" TEXT,
    "status" "PosDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "deviceKeyHash" TEXT NOT NULL,
    "meta" JSONB,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "PosDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosDevice_deviceStableId_key" ON "PosDevice"("deviceStableId");

-- CreateIndex
CREATE INDEX "PosDevice_storeId_idx" ON "PosDevice"("storeId");
