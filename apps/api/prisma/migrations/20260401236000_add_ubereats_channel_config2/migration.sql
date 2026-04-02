/*
  Warnings:

  - You are about to drop the `UberPriceBookItem` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[merchantUberUserId,uberStoreId]` on the table `UberStoreMapping` will be added. If there are existing duplicate values, this will fail.
*/

-- AlterTable
ALTER TABLE "UberMenuPublishVersion" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedBy" TEXT,
ADD COLUMN     "requestPayload" JSONB,
ADD COLUMN     "responsePayload" JSONB,
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "uberStoreId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- DropTable
DROP TABLE "UberPriceBookItem";

-- CreateTable
CREATE TABLE "UberItemChannelConfig" (
    "id" UUID NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "uberStoreId" TEXT,
    "menuItemStableId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "displayName" TEXT,
    "displayDescription" TEXT,
    "externalItemId" TEXT,
    "externalCategoryId" TEXT,
    "lastPublishedPriceCents" INTEGER,
    "lastPublishedIsAvailable" BOOLEAN,
    "lastPublishedHash" TEXT,
    "lastPublishedAt" TIMESTAMP(3),
    "lastPublishError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UberItemChannelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UberCategoryConfig" (
    "id" UUID NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "uberStoreId" TEXT,
    "menuCategoryStableId" TEXT NOT NULL,
    "displayName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "externalCategoryId" TEXT,
    "lastPublishedAt" TIMESTAMP(3),
    "lastPublishError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UberCategoryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UberModifierGroupConfig" (
    "id" UUID NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "uberStoreId" TEXT,
    "templateGroupStableId" TEXT NOT NULL,
    "displayName" TEXT,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "externalModifierGroupId" TEXT,
    "lastPublishedAt" TIMESTAMP(3),
    "lastPublishError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UberModifierGroupConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UberOptionItemConfig" (
    "id" UUID NOT NULL,
    "storeId" TEXT NOT NULL DEFAULT 'default',
    "uberStoreId" TEXT,
    "optionChoiceStableId" TEXT NOT NULL,
    "displayName" TEXT,
    "displayDescription" TEXT,
    "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "externalItemId" TEXT,
    "lastPublishedPriceDeltaCents" INTEGER,
    "lastPublishedIsAvailable" BOOLEAN,
    "lastPublishedHash" TEXT,
    "lastPublishedAt" TIMESTAMP(3),
    "lastPublishError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UberOptionItemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UberItemChannelConfig_storeId_updatedAt_idx" ON "UberItemChannelConfig"("storeId", "updatedAt");

-- CreateIndex
CREATE INDEX "UberItemChannelConfig_uberStoreId_idx" ON "UberItemChannelConfig"("uberStoreId");

-- CreateIndex
CREATE UNIQUE INDEX "UberItemChannelConfig_storeId_menuItemStableId_key" ON "UberItemChannelConfig"("storeId", "menuItemStableId");

-- CreateIndex
CREATE INDEX "UberCategoryConfig_storeId_sortOrder_idx" ON "UberCategoryConfig"("storeId", "sortOrder");

-- CreateIndex
CREATE INDEX "UberCategoryConfig_uberStoreId_idx" ON "UberCategoryConfig"("uberStoreId");

-- CreateIndex
CREATE UNIQUE INDEX "UberCategoryConfig_storeId_menuCategoryStableId_key" ON "UberCategoryConfig"("storeId", "menuCategoryStableId");

-- CreateIndex
CREATE INDEX "UberModifierGroupConfig_storeId_updatedAt_idx" ON "UberModifierGroupConfig"("storeId", "updatedAt");

-- CreateIndex
CREATE INDEX "UberModifierGroupConfig_uberStoreId_idx" ON "UberModifierGroupConfig"("uberStoreId");

-- CreateIndex
CREATE UNIQUE INDEX "UberModifierGroupConfig_storeId_templateGroupStableId_key" ON "UberModifierGroupConfig"("storeId", "templateGroupStableId");

-- CreateIndex
CREATE INDEX "UberOptionItemConfig_storeId_updatedAt_idx" ON "UberOptionItemConfig"("storeId", "updatedAt");

-- CreateIndex
CREATE INDEX "UberOptionItemConfig_uberStoreId_idx" ON "UberOptionItemConfig"("uberStoreId");

-- CreateIndex
CREATE UNIQUE INDEX "UberOptionItemConfig_storeId_optionChoiceStableId_key" ON "UberOptionItemConfig"("storeId", "optionChoiceStableId");

-- CreateIndex
CREATE INDEX "UberMenuPublishVersion_status_createdAt_idx" ON "UberMenuPublishVersion"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UberStoreMapping_merchantUberUserId_uberStoreId_key" ON "UberStoreMapping"("merchantUberUserId", "uberStoreId");
