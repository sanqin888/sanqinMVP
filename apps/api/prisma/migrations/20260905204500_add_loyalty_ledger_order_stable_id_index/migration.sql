-- Phase 4 Slice 5B: support Benefits-owned order usage reads by stable Order identity.
--
-- This is a non-unique read-performance index only. LoyaltyLedger legitimately has
-- multiple rows per Order, and the nullable field remains additive/optional.
CREATE INDEX "LoyaltyLedger_orderStableId_idx"
ON "LoyaltyLedger"("orderStableId");
