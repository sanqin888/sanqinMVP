-- AlterTable
ALTER TABLE "MenuCategory" ADD COLUMN     "storeStableId" TEXT;

-- AlterTable
ALTER TABLE "MenuOptionGroupTemplate" ADD COLUMN     "storeStableId" TEXT;

-- CreateIndex
CREATE INDEX "MenuCategory_storeStableId_deletedAt_sortOrder_idx" ON "MenuCategory"("storeStableId", "deletedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuOptionGroupTemplate_storeStableId_deletedAt_sortOrder_idx" ON "MenuOptionGroupTemplate"("storeStableId", "deletedAt", "sortOrder");

-- Backfill existing brand-level Catalog roots to the current canonical Store.
UPDATE "MenuCategory"
SET "storeStableId" = '4750_Yonge_Street'
WHERE "storeStableId" IS NULL;

UPDATE "MenuOptionGroupTemplate"
SET "storeStableId" = '4750_Yonge_Street'
WHERE "storeStableId" IS NULL;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_storeStableId_fkey" FOREIGN KEY ("storeStableId") REFERENCES "Store"("storeStableId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuOptionGroupTemplate" ADD CONSTRAINT "MenuOptionGroupTemplate_storeStableId_fkey" FOREIGN KEY ("storeStableId") REFERENCES "Store"("storeStableId") ON DELETE RESTRICT ON UPDATE CASCADE;
