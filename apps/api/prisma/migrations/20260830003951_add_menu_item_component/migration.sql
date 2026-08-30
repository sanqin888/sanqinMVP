-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "componentsJson" JSONB;

-- CreateTable
CREATE TABLE "MenuItemComponent" (
    "id" TEXT NOT NULL,
    "parentItemId" TEXT NOT NULL,
    "componentItemStableId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MenuItemComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuItemComponent_parentItemId_sortOrder_idx" ON "MenuItemComponent"("parentItemId", "sortOrder");

-- CreateIndex
CREATE INDEX "MenuItemComponent_componentItemStableId_idx" ON "MenuItemComponent"("componentItemStableId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemComponent_parentItemId_componentItemStableId_key" ON "MenuItemComponent"("parentItemId", "componentItemStableId");

-- AddForeignKey
ALTER TABLE "MenuItemComponent" ADD CONSTRAINT "MenuItemComponent_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemComponent" ADD CONSTRAINT "MenuItemComponent_componentItemStableId_fkey" FOREIGN KEY ("componentItemStableId") REFERENCES "MenuItem"("stableId") ON DELETE RESTRICT ON UPDATE CASCADE;
