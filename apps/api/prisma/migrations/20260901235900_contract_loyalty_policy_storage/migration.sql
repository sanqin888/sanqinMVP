-- Loyalty Phase D final persistence contraction.
-- LoyaltyProgramPolicy(id=1) is the sole canonical policy row after the
-- application read/write cutover. Before dropping the compatibility columns,
-- fail closed if the three persisted copies have drifted.

BEGIN;

DO $$
DECLARE
  policy_row RECORD;
  brand_row RECORD;
  business_row RECORD;
  mismatched_fields TEXT[];
BEGIN
  SELECT *
  INTO policy_row
  FROM "LoyaltyProgramPolicy"
  WHERE "id" = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loyalty Phase D contraction blocked: LoyaltyProgramPolicy(id=1) is missing';
  END IF;

  SELECT *
  INTO brand_row
  FROM "BrandConfig"
  WHERE "id" = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loyalty Phase D contraction blocked: BrandConfig(id=1) is missing';
  END IF;

  SELECT *
  INTO business_row
  FROM "BusinessConfig"
  WHERE "id" = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loyalty Phase D contraction blocked: BusinessConfig(id=1) is missing';
  END IF;

  mismatched_fields := array_remove(ARRAY[
    CASE WHEN policy_row."earnPtPerDollar" IS DISTINCT FROM brand_row."earnPtPerDollar"
           OR policy_row."earnPtPerDollar" IS DISTINCT FROM business_row."earnPtPerDollar"
      THEN 'earnPtPerDollar' END,
    CASE WHEN policy_row."redeemDollarPerPoint" IS DISTINCT FROM brand_row."redeemDollarPerPoint"
           OR policy_row."redeemDollarPerPoint" IS DISTINCT FROM business_row."redeemDollarPerPoint"
      THEN 'redeemDollarPerPoint' END,
    CASE WHEN policy_row."referralPtPerDollar" IS DISTINCT FROM brand_row."referralPtPerDollar"
           OR policy_row."referralPtPerDollar" IS DISTINCT FROM business_row."referralPtPerDollar"
      THEN 'referralPtPerDollar' END,
    CASE WHEN policy_row."tierMultiplierBronze" IS DISTINCT FROM brand_row."tierMultiplierBronze"
           OR policy_row."tierMultiplierBronze" IS DISTINCT FROM business_row."tierMultiplierBronze"
      THEN 'tierMultiplierBronze' END,
    CASE WHEN policy_row."tierMultiplierSilver" IS DISTINCT FROM brand_row."tierMultiplierSilver"
           OR policy_row."tierMultiplierSilver" IS DISTINCT FROM business_row."tierMultiplierSilver"
      THEN 'tierMultiplierSilver' END,
    CASE WHEN policy_row."tierMultiplierGold" IS DISTINCT FROM brand_row."tierMultiplierGold"
           OR policy_row."tierMultiplierGold" IS DISTINCT FROM business_row."tierMultiplierGold"
      THEN 'tierMultiplierGold' END,
    CASE WHEN policy_row."tierMultiplierPlatinum" IS DISTINCT FROM brand_row."tierMultiplierPlatinum"
           OR policy_row."tierMultiplierPlatinum" IS DISTINCT FROM business_row."tierMultiplierPlatinum"
      THEN 'tierMultiplierPlatinum' END,
    CASE WHEN policy_row."tierThresholdSilver" IS DISTINCT FROM brand_row."tierThresholdSilver"
           OR policy_row."tierThresholdSilver" IS DISTINCT FROM business_row."tierThresholdSilver"
      THEN 'tierThresholdSilver' END,
    CASE WHEN policy_row."tierThresholdGold" IS DISTINCT FROM brand_row."tierThresholdGold"
           OR policy_row."tierThresholdGold" IS DISTINCT FROM business_row."tierThresholdGold"
      THEN 'tierThresholdGold' END,
    CASE WHEN policy_row."tierThresholdPlatinum" IS DISTINCT FROM brand_row."tierThresholdPlatinum"
           OR policy_row."tierThresholdPlatinum" IS DISTINCT FROM business_row."tierThresholdPlatinum"
      THEN 'tierThresholdPlatinum' END
  ], NULL);

  IF cardinality(mismatched_fields) > 0 THEN
    RAISE EXCEPTION
      'Loyalty Phase D contraction blocked: persistence drift detected in fields: %',
      array_to_string(mismatched_fields, ', ');
  END IF;
END;
$$;

-- Keep the existing BusinessConfig -> BrandConfig/StoreConfig compatibility
-- bridge for non-Loyalty configuration only. Loyalty is intentionally absent.
CREATE OR REPLACE FUNCTION "syncBusinessConfigToCanonicalConfig"()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "BrandConfig" (
    "id",
    "brandNameZh",
    "brandNameEn",
    "siteUrl",
    "emailFromNameZh",
    "emailFromNameEn",
    "emailFromAddress",
    "smsSignature",
    "supportPhone",
    "supportEmail",
    "wechatAlipayExchangeRate",
    "updatedAt"
  ) VALUES (
    NEW."id",
    NEW."brandNameZh",
    NEW."brandNameEn",
    NEW."siteUrl",
    NEW."emailFromNameZh",
    NEW."emailFromNameEn",
    NEW."emailFromAddress",
    NEW."smsSignature",
    NEW."supportPhone",
    NEW."supportEmail",
    NEW."wechatAlipayExchangeRate",
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO UPDATE SET
    "brandNameZh" = EXCLUDED."brandNameZh",
    "brandNameEn" = EXCLUDED."brandNameEn",
    "siteUrl" = EXCLUDED."siteUrl",
    "emailFromNameZh" = EXCLUDED."emailFromNameZh",
    "emailFromNameEn" = EXCLUDED."emailFromNameEn",
    "emailFromAddress" = EXCLUDED."emailFromAddress",
    "smsSignature" = EXCLUDED."smsSignature",
    "supportPhone" = EXCLUDED."supportPhone",
    "supportEmail" = EXCLUDED."supportEmail",
    "wechatAlipayExchangeRate" = EXCLUDED."wechatAlipayExchangeRate",
    "updatedAt" = CURRENT_TIMESTAMP;

  UPDATE "Store"
  SET "name" = COALESCE(NULLIF(BTRIM(NEW."storeName"), ''), "name"),
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "storeStableId" = '4750_Yonge_Street';

  INSERT INTO "StoreConfig" (
    "storeId",
    "timezone",
    "isTemporarilyClosed",
    "temporaryCloseReason",
    "publicNotice",
    "publicNoticeEn",
    "deliveryBaseFeeCents",
    "priorityPerKmCents",
    "maxDeliveryRangeKm",
    "priorityDefaultDistanceKm",
    "latitude",
    "longitude",
    "addressLine1",
    "addressLine2",
    "city",
    "province",
    "postalCode",
    "salesTaxRate",
    "enableUberDirect",
    "updatedAt"
  ) VALUES (
    '8a3d4c0e-4750-4f6a-9138-000000000001'::uuid,
    COALESCE(NULLIF(BTRIM(NEW."timezone"), ''), 'America/Toronto'),
    NEW."isTemporarilyClosed",
    NEW."temporaryCloseReason",
    NEW."publicNotice",
    NEW."publicNoticeEn",
    NEW."deliveryBaseFeeCents",
    NEW."priorityPerKmCents",
    NEW."maxDeliveryRangeKm",
    NEW."priorityDefaultDistanceKm",
    COALESCE(NEW."storeLatitude", 43.760288),
    COALESCE(NEW."storeLongitude", -79.412167),
    COALESCE(NULLIF(BTRIM(NEW."storeAddressLine1"), ''), '4750 Yonge St.'),
    COALESCE(NULLIF(BTRIM(NEW."storeAddressLine2"), ''), 'Unit 138'),
    COALESCE(NULLIF(BTRIM(NEW."storeCity"), ''), 'Toronto'),
    COALESCE(NULLIF(BTRIM(NEW."storeProvince"), ''), 'ON'),
    COALESCE(NULLIF(BTRIM(NEW."storePostalCode"), ''), 'M2N 5M6'),
    NEW."salesTaxRate",
    NEW."enableUberDirect",
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("storeId") DO UPDATE SET
    "timezone" = EXCLUDED."timezone",
    "isTemporarilyClosed" = EXCLUDED."isTemporarilyClosed",
    "temporaryCloseReason" = EXCLUDED."temporaryCloseReason",
    "publicNotice" = EXCLUDED."publicNotice",
    "publicNoticeEn" = EXCLUDED."publicNoticeEn",
    "deliveryBaseFeeCents" = EXCLUDED."deliveryBaseFeeCents",
    "priorityPerKmCents" = EXCLUDED."priorityPerKmCents",
    "maxDeliveryRangeKm" = EXCLUDED."maxDeliveryRangeKm",
    "priorityDefaultDistanceKm" = EXCLUDED."priorityDefaultDistanceKm",
    "latitude" = EXCLUDED."latitude",
    "longitude" = EXCLUDED."longitude",
    "addressLine1" = EXCLUDED."addressLine1",
    "addressLine2" = EXCLUDED."addressLine2",
    "city" = EXCLUDED."city",
    "province" = EXCLUDED."province",
    "postalCode" = EXCLUDED."postalCode",
    "salesTaxRate" = EXCLUDED."salesTaxRate",
    "enableUberDirect" = EXCLUDED."enableUberDirect",
    "updatedAt" = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Verify the replacement function is Loyalty-free before destructive DDL.
DO $$
DECLARE
  trigger_definition TEXT;
  loyalty_field TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO trigger_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = current_schema()
    AND p.proname = 'syncBusinessConfigToCanonicalConfig'
    AND p.pronargs = 0;

  IF trigger_definition IS NULL THEN
    RAISE EXCEPTION 'Loyalty Phase D contraction blocked: syncBusinessConfigToCanonicalConfig() is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = current_schema()
      AND c.relname = 'BusinessConfig'
      AND t.tgname = 'BusinessConfig_sync_canonical_config'
      AND p.proname = 'syncBusinessConfigToCanonicalConfig'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Loyalty Phase D contraction blocked: BusinessConfig canonical sync trigger is missing or bound to another function';
  END IF;

  FOREACH loyalty_field IN ARRAY ARRAY[
    'earnPtPerDollar',
    'redeemDollarPerPoint',
    'referralPtPerDollar',
    'tierMultiplierBronze',
    'tierMultiplierSilver',
    'tierMultiplierGold',
    'tierMultiplierPlatinum',
    'tierThresholdSilver',
    'tierThresholdGold',
    'tierThresholdPlatinum'
  ]
  LOOP
    IF strpos(trigger_definition, format('"%s"', loyalty_field)) > 0 THEN
      RAISE EXCEPTION
        'Loyalty Phase D contraction blocked: trigger function still references %',
        loyalty_field;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE "BrandConfig"
  DROP COLUMN "earnPtPerDollar",
  DROP COLUMN "redeemDollarPerPoint",
  DROP COLUMN "referralPtPerDollar",
  DROP COLUMN "tierMultiplierBronze",
  DROP COLUMN "tierMultiplierSilver",
  DROP COLUMN "tierMultiplierGold",
  DROP COLUMN "tierMultiplierPlatinum",
  DROP COLUMN "tierThresholdSilver",
  DROP COLUMN "tierThresholdGold",
  DROP COLUMN "tierThresholdPlatinum";

ALTER TABLE "BusinessConfig"
  DROP COLUMN "earnPtPerDollar",
  DROP COLUMN "redeemDollarPerPoint",
  DROP COLUMN "referralPtPerDollar",
  DROP COLUMN "tierMultiplierBronze",
  DROP COLUMN "tierMultiplierSilver",
  DROP COLUMN "tierMultiplierGold",
  DROP COLUMN "tierMultiplierPlatinum",
  DROP COLUMN "tierThresholdSilver",
  DROP COLUMN "tierThresholdGold",
  DROP COLUMN "tierThresholdPlatinum";

-- Postcondition: neither legacy config table may retain a Loyalty policy column.
DO $$
DECLARE
  remaining_columns TEXT[];
BEGIN
  SELECT array_agg(format('%I.%I', table_name, column_name) ORDER BY table_name, column_name)
  INTO remaining_columns
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name IN ('BrandConfig', 'BusinessConfig')
    AND column_name = ANY (ARRAY[
      'earnPtPerDollar',
      'redeemDollarPerPoint',
      'referralPtPerDollar',
      'tierMultiplierBronze',
      'tierMultiplierSilver',
      'tierMultiplierGold',
      'tierMultiplierPlatinum',
      'tierThresholdSilver',
      'tierThresholdGold',
      'tierThresholdPlatinum'
    ]);

  IF remaining_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'Loyalty Phase D contraction incomplete: legacy Loyalty columns remain: %',
      array_to_string(remaining_columns, ', ');
  END IF;
END;
$$;

COMMIT;
