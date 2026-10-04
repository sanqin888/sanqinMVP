-- CreateTable
CREATE TABLE "StoreOperatingHistoryState" (
    "storeId" UUID NOT NULL,
    "trackingStartedAt" TIMESTAMP(3) NOT NULL,
    "scheduleRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreOperatingHistoryState_pkey" PRIMARY KEY ("storeId")
);

-- CreateTable
CREATE TABLE "StoreScheduleVersion" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "businessHoursSnapshot" JSONB NOT NULL,
    "holidaysSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreTemporaryClosureInterval" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreTemporaryClosureInterval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogAvailabilityHistoryState" (
    "storeStableId" TEXT NOT NULL,
    "trackingStartedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogAvailabilityHistoryState_pkey" PRIMARY KEY ("storeStableId")
);

-- CreateTable
CREATE TABLE "CatalogItemUnavailableInterval" (
    "id" UUID NOT NULL,
    "storeStableId" TEXT NOT NULL,
    "menuItemStableId" TEXT NOT NULL,
    "nameEnSnapshot" TEXT NOT NULL,
    "nameZhSnapshot" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItemUnavailableInterval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreScheduleVersion_storeId_effectiveFrom_idx" ON "StoreScheduleVersion"("storeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "StoreScheduleVersion_storeId_revision_key" ON "StoreScheduleVersion"("storeId", "revision");

-- CreateIndex
CREATE INDEX "StoreTemporaryClosureInterval_storeId_startedAt_idx" ON "StoreTemporaryClosureInterval"("storeId", "startedAt");

-- CreateIndex
CREATE INDEX "StoreTemporaryClosureInterval_storeId_endedAt_idx" ON "StoreTemporaryClosureInterval"("storeId", "endedAt");

-- CreateIndex
CREATE INDEX "CatalogItemUnavailableInterval_storeStableId_startedAt_idx" ON "CatalogItemUnavailableInterval"("storeStableId", "startedAt");

-- CreateIndex
CREATE INDEX "CatalogItemUnavailableInterval_storeStableId_endedAt_idx" ON "CatalogItemUnavailableInterval"("storeStableId", "endedAt");

-- CreateIndex
CREATE INDEX "CatalogItemUnavailableInterval_storeStableId_menuItemStable_idx" ON "CatalogItemUnavailableInterval"("storeStableId", "menuItemStableId", "startedAt");

-- AddForeignKey
ALTER TABLE "StoreOperatingHistoryState" ADD CONSTRAINT "StoreOperatingHistoryState_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreScheduleVersion" ADD CONSTRAINT "StoreScheduleVersion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreTemporaryClosureInterval" ADD CONSTRAINT "StoreTemporaryClosureInterval_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
