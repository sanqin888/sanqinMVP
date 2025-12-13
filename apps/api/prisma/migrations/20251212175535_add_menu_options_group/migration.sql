/*
  Warnings:

  - You are about to drop the `MenuOption` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MenuOptionGroup` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."MenuOption" DROP CONSTRAINT "MenuOption_groupId_fkey";

-- DropForeignKey
ALTER TABLE "public"."MenuOptionGroup" DROP CONSTRAINT "MenuOptionGroup_itemId_fkey";

-- DropTable
DROP TABLE "public"."MenuOption";

-- DropTable
DROP TABLE "public"."MenuOptionGroup";

-- CreateTable
CREATE TABLE "MenuOptionGroupTemplate" (
    "id" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameZh" TEXT,
    "defaultMinSelect" INTEGER NOT NULL DEFAULT 0,
    "defaultMaxSelect" INTEGER DEFAULT 1,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "tempUnavailableUntil" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuOptionGroupTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuOptionTemplateChoice" (
    "id" TEXT NOT NULL,
    "templateGroupId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameZh" TEXT,
    "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "tempUnavailableUntil" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuOptionTemplateChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemOptionGroup" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "templateGroupId" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MenuItemOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuOptionGroupTemplate_sortOrder_idx" ON "MenuOptionGroupTemplate"("sortOrder");

-- CreateIndex
CREATE INDEX "MenuOptionTemplateChoice_templateGroupId_sortOrder_idx" ON "MenuOptionTemplateChoice"("templateGroupId", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuItemOptionGroup_itemId_sortOrder_idx" ON "MenuItemOptionGroup"("itemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemOptionGroup_itemId_templateGroupId_key" ON "MenuItemOptionGroup"("itemId", "templateGroupId");

-- AddForeignKey
ALTER TABLE "MenuOptionTemplateChoice" ADD CONSTRAINT "MenuOptionTemplateChoice_templateGroupId_fkey" FOREIGN KEY ("templateGroupId") REFERENCES "MenuOptionGroupTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemOptionGroup" ADD CONSTRAINT "MenuItemOptionGroup_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemOptionGroup" ADD CONSTRAINT "MenuItemOptionGroup_templateGroupId_fkey" FOREIGN KEY ("templateGroupId") REFERENCES "MenuOptionGroupTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
