-- CreateTable
CREATE TABLE "UberOAuthStateRequest" (
    "nonce" TEXT NOT NULL,
    "adminSessionId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "merchantContext" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "UberOAuthStateRequest_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE INDEX "UberOAuthStateRequest_expiresAt_idx" ON "UberOAuthStateRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "UberOAuthStateRequest_consumedAt_expiresAt_idx" ON "UberOAuthStateRequest"("consumedAt", "expiresAt");
