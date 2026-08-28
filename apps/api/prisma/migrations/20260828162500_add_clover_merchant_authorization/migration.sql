-- CreateEnum
CREATE TYPE "CloverMerchantAuthorizationStatus" AS ENUM ('PENDING_BINDING', 'ACTIVE', 'REAUTH_REQUIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CloverOAuthStateStatus" AS ENUM ('ISSUED', 'EXCHANGING', 'EXCHANGED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "CloverMerchantAuthorization" (
    "id" UUID NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT,
    "storeStableId" TEXT,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "status" "CloverMerchantAuthorizationStatus" NOT NULL DEFAULT 'PENDING_BINDING',
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "refreshLeaseId" TEXT,
    "refreshLeaseExpiresAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3) NOT NULL,
    "refreshedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloverMerchantAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloverOAuthStateRequest" (
    "stateHash" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "status" "CloverOAuthStateStatus" NOT NULL DEFAULT 'ISSUED',
    "lastErrorCode" TEXT,
    "encryptedExchangeResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloverOAuthStateRequest_pkey" PRIMARY KEY ("stateHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "CloverMerchantAuthorization_merchantId_key" ON "CloverMerchantAuthorization"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "CloverMerchantAuthorization_storeStableId_key" ON "CloverMerchantAuthorization"("storeStableId");

-- CreateIndex
CREATE INDEX "CloverMerchantAuthorization_status_accessTokenExpiresAt_idx" ON "CloverMerchantAuthorization"("status", "accessTokenExpiresAt");

-- CreateIndex
CREATE INDEX "CloverMerchantAuthorization_status_refreshTokenExpiresAt_idx" ON "CloverMerchantAuthorization"("status", "refreshTokenExpiresAt");

-- CreateIndex
CREATE INDEX "CloverMerchantAuthorization_refreshLeaseExpiresAt_idx" ON "CloverMerchantAuthorization"("refreshLeaseExpiresAt");

-- CreateIndex
CREATE INDEX "CloverOAuthStateRequest_expiresAt_idx" ON "CloverOAuthStateRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "CloverOAuthStateRequest_status_expiresAt_idx" ON "CloverOAuthStateRequest"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "CloverMerchantAuthorization" ADD CONSTRAINT "CloverMerchantAuthorization_storeStableId_fkey" FOREIGN KEY ("storeStableId") REFERENCES "Store"("storeStableId") ON DELETE SET NULL ON UPDATE CASCADE;
