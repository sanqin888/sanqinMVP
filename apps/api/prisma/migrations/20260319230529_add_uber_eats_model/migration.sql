-- CreateTable
CREATE TABLE "UberMerchantConnection" (
    "id" UUID NOT NULL,
    "merchantUberUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "tokenType" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawStoresSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UberMerchantConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UberStoreMapping" (
    "id" UUID NOT NULL,
    "uberStoreId" TEXT NOT NULL,
    "merchantUberUserId" TEXT NOT NULL,
    "storeName" TEXT,
    "locationSummary" TEXT,
    "isProvisioned" BOOLEAN NOT NULL DEFAULT false,
    "provisionedAt" TIMESTAMP(3),
    "posExternalStoreId" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UberStoreMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UberMerchantConnection_merchantUberUserId_key" ON "UberMerchantConnection"("merchantUberUserId");

-- CreateIndex
CREATE INDEX "UberMerchantConnection_connectedAt_idx" ON "UberMerchantConnection"("connectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UberStoreMapping_uberStoreId_key" ON "UberStoreMapping"("uberStoreId");

-- CreateIndex
CREATE INDEX "UberStoreMapping_merchantUberUserId_isProvisioned_idx" ON "UberStoreMapping"("merchantUberUserId", "isProvisioned");

-- AddForeignKey
ALTER TABLE "UberStoreMapping" ADD CONSTRAINT "UberStoreMapping_merchantUberUserId_fkey" FOREIGN KEY ("merchantUberUserId") REFERENCES "UberMerchantConnection"("merchantUberUserId") ON DELETE CASCADE ON UPDATE CASCADE;
