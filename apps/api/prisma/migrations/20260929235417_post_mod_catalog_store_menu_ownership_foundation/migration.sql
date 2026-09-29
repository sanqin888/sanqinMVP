-- AlterTable
ALTER TABLE "MenuCategory" ADD COLUMN     "storeStableId" TEXT;

-- AlterTable
ALTER TABLE "MenuOptionGroupTemplate" ADD COLUMN     "storeStableId" TEXT;

-- CreateIndex
CREATE INDEX "MenuCategory_storeStableId_deletedAt_sortOrder_idx" ON "MenuCategory"("storeStableId", "deletedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuOptionGroupTemplate_storeStableId_deletedAt_sortOrder_idx" ON "MenuOptionGroupTemplate"("storeStableId", "deletedAt", "sortOrder");

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_storeStableId_fkey" FOREIGN KEY ("storeStableId") REFERENCES "Store"("storeStableId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuOptionGroupTemplate" ADD CONSTRAINT "MenuOptionGroupTemplate_storeStableId_fkey" FOREIGN KEY ("storeStableId") REFERENCES "Store"("storeStableId") ON DELETE RESTRICT ON UPDATE CASCADE;
