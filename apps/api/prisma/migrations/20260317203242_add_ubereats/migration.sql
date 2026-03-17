-- CreateEnum
CREATE TYPE "UberMenuPublishStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "UberOpsTicketType" AS ENUM ('ORDER_STATUS_SYNC', 'STORE_STATUS_SYNC', 'MENU_PUBLISH', 'MENU_ITEM_AVAILABILITY');

-- CreateEnum
CREATE TYPE "UberOpsTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "UberOpsTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "UberPriceBookItem" (
    "id" UUID NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "menuItemStableId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UberPriceBookItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UberMenuPublishVersion" (
    "id" UUID NOT NULL,
    "versionStableId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "status" "UberMenuPublishStatus" NOT NULL DEFAULT 'SUCCESS',
    "totalItems" INTEGER NOT NULL,
    "changedItems" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UberMenuPublishVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UberReconciliationReport" (
    "id" UUID NOT NULL,
    "reportStableId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "rangeStart" TIMESTAMP(3) NOT NULL,
    "rangeEnd" TIMESTAMP(3) NOT NULL,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "syncedOrders" INTEGER NOT NULL DEFAULT 0,
    "failedSyncEvents" INTEGER NOT NULL DEFAULT 0,
    "pendingOrders" INTEGER NOT NULL DEFAULT 0,
    "discrepancyOrders" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UberReconciliationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UberOpsTicket" (
    "id" UUID NOT NULL,
    "ticketStableId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "type" "UberOpsTicketType" NOT NULL,
    "status" "UberOpsTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "UberOpsTicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "externalOrderId" TEXT,
    "menuItemStableId" TEXT,
    "context" JSONB,
    "lastError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "UberOpsTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UberPriceBookItem_storeId_updatedAt_idx" ON "UberPriceBookItem"("storeId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UberPriceBookItem_storeId_menuItemStableId_key" ON "UberPriceBookItem"("storeId", "menuItemStableId");

-- CreateIndex
CREATE UNIQUE INDEX "UberMenuPublishVersion_versionStableId_key" ON "UberMenuPublishVersion"("versionStableId");

-- CreateIndex
CREATE INDEX "UberMenuPublishVersion_storeId_createdAt_idx" ON "UberMenuPublishVersion"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UberReconciliationReport_reportStableId_key" ON "UberReconciliationReport"("reportStableId");

-- CreateIndex
CREATE INDEX "UberReconciliationReport_storeId_createdAt_idx" ON "UberReconciliationReport"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "UberReconciliationReport_rangeStart_rangeEnd_idx" ON "UberReconciliationReport"("rangeStart", "rangeEnd");

-- CreateIndex
CREATE UNIQUE INDEX "UberOpsTicket_ticketStableId_key" ON "UberOpsTicket"("ticketStableId");

-- CreateIndex
CREATE INDEX "UberOpsTicket_storeId_status_priority_createdAt_idx" ON "UberOpsTicket"("storeId", "status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "UberOpsTicket_externalOrderId_idx" ON "UberOpsTicket"("externalOrderId");
