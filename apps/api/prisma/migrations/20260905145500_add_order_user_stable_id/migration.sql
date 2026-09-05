-- Phase 4 Slice 4C: persist the member business identity on Order so Orders-owned
-- member read models do not need to resolve User DB UUIDs across the Identity boundary.
--
-- Expand only: keep the historical Order.userId relation key during this phase.
ALTER TABLE "Order"
ADD COLUMN "userStableId" TEXT;

-- Deterministic backfill from the existing internal relation. This is idempotent
-- for rows already populated by a partially retried migration.
UPDATE "Order" AS o
SET "userStableId" = u."userStableId"
FROM "User" AS u
WHERE o."userId" = u."id"
  AND o."userStableId" IS NULL;

DO $$
DECLARE
  member_order_count BIGINT;
  populated_stable_id_count BIGINT;
  mismatched_stable_id_count BIGINT;
  orphan_user_id_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO member_order_count
  FROM "Order"
  WHERE "userId" IS NOT NULL;

  SELECT COUNT(*)
  INTO populated_stable_id_count
  FROM "Order"
  WHERE "userId" IS NOT NULL
    AND "userStableId" IS NOT NULL;

  SELECT COUNT(*)
  INTO mismatched_stable_id_count
  FROM "Order" AS o
  JOIN "User" AS u ON u."id" = o."userId"
  WHERE o."userId" IS NOT NULL
    AND o."userStableId" IS DISTINCT FROM u."userStableId";

  SELECT COUNT(*)
  INTO orphan_user_id_count
  FROM "Order" AS o
  LEFT JOIN "User" AS u ON u."id" = o."userId"
  WHERE o."userId" IS NOT NULL
    AND u."id" IS NULL;

  RAISE NOTICE 'Order member stable-id backfill: member_orders=%, populated=%, mismatched=%, orphan_user_ids=%',
    member_order_count,
    populated_stable_id_count,
    mismatched_stable_id_count,
    orphan_user_id_count;

  IF populated_stable_id_count <> member_order_count THEN
    RAISE EXCEPTION 'Order.userStableId backfill incomplete: member_orders=%, populated=%',
      member_order_count,
      populated_stable_id_count;
  END IF;

  IF mismatched_stable_id_count <> 0 THEN
    RAISE EXCEPTION 'Order.userStableId backfill mismatch: % rows disagree with User.userStableId',
      mismatched_stable_id_count;
  END IF;

  IF orphan_user_id_count <> 0 THEN
    RAISE EXCEPTION 'Order.userStableId backfill found % orphan Order.userId values',
      orphan_user_id_count;
  END IF;
END $$;

CREATE INDEX "Order_userStableId_createdAt_idx"
ON "Order"("userStableId", "createdAt");
