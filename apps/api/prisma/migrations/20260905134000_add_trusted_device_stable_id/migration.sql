-- Expand TrustedDevice with a browser-safe stable business identifier.
ALTER TABLE "TrustedDevice" ADD COLUMN "trustedDeviceStableId" TEXT;

-- Deterministic/idempotent backfill for existing rows. The c + 23 hex shape matches
-- the repository's historical cuid-like stable-ID backfill convention while keeping
-- the internal UUID itself out of public contracts.
UPDATE "TrustedDevice"
SET "trustedDeviceStableId" = 'c' || substring(md5("id"::text), 1, 23)
WHERE "trustedDeviceStableId" IS NULL;

-- Fail before tightening the column if row counts do not reconcile or values collide.
DO $$
DECLARE
  total_count BIGINT;
  populated_count BIGINT;
  distinct_count BIGINT;
BEGIN
  SELECT
    COUNT(*),
    COUNT("trustedDeviceStableId"),
    COUNT(DISTINCT "trustedDeviceStableId")
  INTO total_count, populated_count, distinct_count
  FROM "TrustedDevice";

  IF total_count <> populated_count THEN
    RAISE EXCEPTION
      'TrustedDevice trustedDeviceStableId backfill incomplete: total=%, populated=%',
      total_count,
      populated_count;
  END IF;

  IF populated_count <> distinct_count THEN
    RAISE EXCEPTION
      'TrustedDevice trustedDeviceStableId backfill produced duplicates: populated=%, distinct=%',
      populated_count,
      distinct_count;
  END IF;

  RAISE NOTICE
    'TrustedDevice stable-ID backfill verified: total=%, populated=%, distinct=%',
    total_count,
    populated_count,
    distinct_count;
END $$;

ALTER TABLE "TrustedDevice"
ALTER COLUMN "trustedDeviceStableId" SET NOT NULL;

CREATE UNIQUE INDEX "TrustedDevice_trustedDeviceStableId_key"
ON "TrustedDevice"("trustedDeviceStableId");
