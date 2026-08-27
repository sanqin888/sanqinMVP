-- CreateEnum
CREATE TYPE "MenuLabelStrategy" AS ENUM ('AUTO', 'ALWAYS', 'NEVER');

-- AlterTable
ALTER TABLE "MenuItem"
ADD COLUMN "labelStrategy" "MenuLabelStrategy" NOT NULL DEFAULT 'AUTO';

-- AlterTable
ALTER TABLE "MenuItemOptionGroup"
ADD COLUMN "affectedPackagingTypeStableIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "PosPrintJob"
ADD COLUMN "labelRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "labelStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "labelAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "labelFailureReason" TEXT,
ADD COLUMN "labelCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MenuPackagingType" (
    "id" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MenuPackagingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemPackaging" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "packagingTypeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuItemPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuPackagingType_stableId_key" ON "MenuPackagingType"("stableId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuPackagingType_name_key" ON "MenuPackagingType"("name");

-- CreateIndex
CREATE INDEX "MenuPackagingType_sortOrder_idx" ON "MenuPackagingType"("sortOrder");

-- CreateIndex
CREATE INDEX "MenuPackagingType_deletedAt_idx" ON "MenuPackagingType"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemPackaging_itemId_packagingTypeId_key" ON "MenuItemPackaging"("itemId", "packagingTypeId");

-- CreateIndex
CREATE INDEX "MenuItemPackaging_itemId_sortOrder_idx" ON "MenuItemPackaging"("itemId", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuItemPackaging_packagingTypeId_idx" ON "MenuItemPackaging"("packagingTypeId");

-- ReplaceIndex
DROP INDEX "PosPrintJob_storeId_customerStatus_kitchenStatus_idx";
CREATE INDEX "PosPrintJob_storeId_customerStatus_kitchenStatus_labelStatus_idx" ON "PosPrintJob"("storeId", "customerStatus", "kitchenStatus", "labelStatus");

-- AddForeignKey
ALTER TABLE "MenuItemPackaging" ADD CONSTRAINT "MenuItemPackaging_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemPackaging" ADD CONSTRAINT "MenuItemPackaging_packagingTypeId_fkey" FOREIGN KEY ("packagingTypeId") REFERENCES "MenuPackagingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
