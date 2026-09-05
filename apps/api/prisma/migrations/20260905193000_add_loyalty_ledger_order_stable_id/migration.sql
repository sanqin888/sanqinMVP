-- Phase 4 Slice 5A: persist the browser-safe Order business identity on LoyaltyLedger.
--
-- Expand only: Loyalty keeps the historical orderId DB UUID for current internal
-- idempotency/refund/amendment paths while read models use orderStableId directly.
ALTER TABLE "LoyaltyLedger"
ADD COLUMN "orderStableId" TEXT;

-- Deterministic/idempotent backfill from the existing internal Order association.
UPDATE "LoyaltyLedger" AS l
SET "orderStableId" = o."orderStableId"
FROM "Order" AS o
WHERE l."orderId" = o."id"
  AND l."orderStableId" IS NULL;

DO $$
DECLARE
  order_linked_ledger_count BIGINT;
  populated_stable_id_count BIGINT;
  mismatched_stable_id_count BIGINT;
  orphan_order_id_count BIGINT;
  stable_without_order_id_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO order_linked_ledger_count
  FROM "LoyaltyLedger"
  WHERE "orderId" IS NOT NULL;

  SELECT COUNT(*)
  INTO populated_stable_id_count
  FROM "LoyaltyLedger"
  WHERE "orderId" IS NOT NULL
    AND "orderStableId" IS NOT NULL;

  SELECT COUNT(*)
  INTO mismatched_stable_id_count
  FROM "LoyaltyLedger" AS l
  JOIN "Order" AS o ON o."id" = l."orderId"
  WHERE l."orderId" IS NOT NULL
    AND l."orderStableId" IS DISTINCT FROM o."orderStableId";

  SELECT COUNT(*)
  INTO orphan_order_id_count
  FROM "LoyaltyLedger" AS l
  LEFT JOIN "Order" AS o ON o."id" = l."orderId"
  WHERE l."orderId" IS NOT NULL
    AND o."id" IS NULL;

  SELECT COUNT(*)
  INTO stable_without_order_id_count
  FROM "LoyaltyLedger"
  WHERE "orderId" IS NULL
    AND "orderStableId" IS NOT NULL;

  RAISE NOTICE 'LoyaltyLedger order stable-id backfill: order_linked=%, populated=%, mismatched=%, orphan_order_ids=%, stable_without_order_id=%',
    order_linked_ledger_count,
    populated_stable_id_count,
    mismatched_stable_id_count,
    orphan_order_id_count,
    stable_without_order_id_count;

  IF populated_stable_id_count <> order_linked_ledger_count THEN
    RAISE EXCEPTION 'LoyaltyLedger.orderStableId backfill incomplete: order_linked=%, populated=%',
      order_linked_ledger_count,
      populated_stable_id_count;
  END IF;

  IF mismatched_stable_id_count <> 0 THEN
    RAISE EXCEPTION 'LoyaltyLedger.orderStableId backfill mismatch: % rows disagree with Order.orderStableId',
      mismatched_stable_id_count;
  END IF;

  IF orphan_order_id_count <> 0 THEN
    RAISE EXCEPTION 'LoyaltyLedger.orderStableId backfill found % orphan LoyaltyLedger.orderId values',
      orphan_order_id_count;
  END IF;

  IF stable_without_order_id_count <> 0 THEN
    RAISE EXCEPTION 'LoyaltyLedger.orderStableId backfill found % stable identities without orderId',
      stable_without_order_id_count;
  END IF;
END $$;
