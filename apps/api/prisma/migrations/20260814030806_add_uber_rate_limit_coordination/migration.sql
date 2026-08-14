-- CreateTable
CREATE TABLE "UberRateLimitState" (
    "partitionKey" TEXT NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL,
    "lastRefillAt" TIMESTAMP(3) NOT NULL,
    "cooldownUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UberRateLimitState_pkey" PRIMARY KEY ("partitionKey")
);

-- CreateTable
CREATE TABLE "UberRateLimitLease" (
    "id" UUID NOT NULL,
    "partitionKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UberRateLimitLease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UberRateLimitLease_partitionKey_expiresAt_idx" ON "UberRateLimitLease"("partitionKey", "expiresAt");

-- CreateIndex
CREATE INDEX "UberRateLimitLease_expiresAt_idx" ON "UberRateLimitLease"("expiresAt");

-- AddForeignKey
ALTER TABLE "UberRateLimitLease" ADD CONSTRAINT "UberRateLimitLease_partitionKey_fkey" FOREIGN KEY ("partitionKey") REFERENCES "UberRateLimitState"("partitionKey") ON DELETE CASCADE ON UPDATE CASCADE;
