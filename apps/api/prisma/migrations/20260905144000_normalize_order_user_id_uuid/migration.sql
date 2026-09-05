-- Phase 4 rollout recovery: normalize the retained internal Order.userId identity
-- to PostgreSQL UUID before the Slice 4C stable-ID backfill runs.
--
-- Order.userId has historically stored User.id values as TEXT. Production
-- preflight on 2026-09-05 found 45/45 non-null values are canonical UUID text
-- and map to User.id. Keep the field nullable for guest/external orders and do
-- not add a foreign key in this recovery migration.

DO $$
DECLARE
  invalid_uuid_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO invalid_uuid_count
  FROM "Order"
  WHERE "userId" IS NOT NULL
    AND "userId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  IF invalid_uuid_count <> 0 THEN
    RAISE EXCEPTION
      'Order.userId UUID normalization blocked: % non-null values are not canonical UUIDs',
      invalid_uuid_count;
  END IF;
END $$;

ALTER TABLE "Order"
ALTER COLUMN "userId" TYPE UUID
USING "userId"::uuid;
