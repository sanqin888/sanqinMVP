-- Phase 6 Slice 3A: internal Order UUIDs must not be owned or persisted by
-- PaymentCheckoutAttempt. This Unified Payment Core table is pre-production and
-- was verified empty before this contraction. Fail closed if that assumption is
-- no longer true at deployment time rather than silently dropping identity data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PaymentCheckoutAttempt" LIMIT 1) THEN
    RAISE EXCEPTION 'PaymentCheckoutAttempt must be empty before contracting plannedOrderId/orderId';
  END IF;
END $$;

DROP INDEX "PaymentCheckoutAttempt_plannedOrderId_key";
DROP INDEX "PaymentCheckoutAttempt_orderId_idx";

ALTER TABLE "PaymentCheckoutAttempt"
  DROP COLUMN "plannedOrderId",
  DROP COLUMN "orderId";
