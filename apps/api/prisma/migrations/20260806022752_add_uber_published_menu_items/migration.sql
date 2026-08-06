-- CreateTable
CREATE TABLE "UberPublishedMenuItem" (
    "id" UUID NOT NULL,
    "publishVersionId" UUID NOT NULL,
    "storeId" TEXT NOT NULL,
    "uberStoreId" TEXT NOT NULL,
    "uberItemId" TEXT NOT NULL,
    "menuItemStableId" TEXT NOT NULL,
    "publishedPriceCents" INTEGER NOT NULL,
    "publishedIsAvailable" BOOLEAN NOT NULL,
    "publishedName" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UberPublishedMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UberPublishedMenuItem_uberStoreId_uberItemId_idx" ON "UberPublishedMenuItem"("uberStoreId", "uberItemId");

-- CreateIndex
CREATE INDEX "UberPublishedMenuItem_storeId_menuItemStableId_publishedAt_idx" ON "UberPublishedMenuItem"("storeId", "menuItemStableId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UberPublishedMenuItem_publishVersionId_uberItemId_key" ON "UberPublishedMenuItem"("publishVersionId", "uberItemId");

-- AddForeignKey
ALTER TABLE "UberPublishedMenuItem" ADD CONSTRAINT "UberPublishedMenuItem_publishVersionId_fkey" FOREIGN KEY ("publishVersionId") REFERENCES "UberMenuPublishVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
