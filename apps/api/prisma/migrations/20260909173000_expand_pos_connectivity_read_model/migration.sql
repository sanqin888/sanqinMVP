-- Phase 7 Slice 5A: add a POS-owned purpose-built connectivity read fact for
-- cross-context shadow observation. This is additive only: Uber order admission
-- continues using the existing PosDevice-derived connectivity truth until Slice 5B.
CREATE TABLE "PosConnectivityReadModel" (
    "storeStableId" TEXT NOT NULL,
    "hasHeartbeatCapableActiveDevice" BOOLEAN NOT NULL DEFAULT false,
    "lastHeartbeatAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosConnectivityReadModel_pkey" PRIMARY KEY ("storeStableId")
);
