-- Phase A expand migration for Benefits-owned Loyalty policy persistence.
-- Runtime reads/writes remain on BrandConfig + BusinessConfig compatibility
-- storage until the separately reviewed Phase B application cutover.

BEGIN;

-- The existing canonical BrandConfig singleton must exist. Do not invent a
-- Loyalty policy from application defaults during migration.
DO $$
DECLARE
  brand_source_count INTEGER;
  legacy_source_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO brand_source_count
  FROM "BrandConfig"
  WHERE "id" = 1;

  IF brand_source_count <> 1 THEN
    RAISE EXCEPTION
      'LoyaltyProgramPolicy backfill requires exactly one BrandConfig(id=1) row; found %',
      brand_source_count;
  END IF;

  SELECT COUNT(*)
  INTO legacy_source_count
  FROM "BusinessConfig"
  WHERE "id" = 1;

  IF legacy_source_count <> 1 THEN
    RAISE EXCEPTION
      'LoyaltyProgramPolicy readiness check requires exactly one BusinessConfig(id=1) compatibility row; found %',
      legacy_source_count;
  END IF;
END $$;

CREATE TABLE "LoyaltyProgramPolicy" (
  "id" INTEGER NOT NULL,
  "earnPtPerDollar" DOUBLE PRECISION NOT NULL,
  "redeemDollarPerPoint" DOUBLE PRECISION NOT NULL,
  "referralPtPerDollar" DOUBLE PRECISION NOT NULL,
  "tierMultiplierBronze" DOUBLE PRECISION NOT NULL,
  "tierMultiplierSilver" DOUBLE PRECISION NOT NULL,
  "tierMultiplierGold" DOUBLE PRECISION NOT NULL,
  "tierMultiplierPlatinum" DOUBLE PRECISION NOT NULL,
  "tierThresholdSilver" INTEGER NOT NULL,
  "tierThresholdGold" INTEGER NOT NULL,
  "tierThresholdPlatinum" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LoyaltyProgramPolicy_pkey" PRIMARY KEY ("id")
);

-- Backfill the singleton directly from the current canonical BrandConfig row.
INSERT INTO "LoyaltyProgramPolicy" (
  "id",
  "earnPtPerDollar",
  "redeemDollarPerPoint",
  "referralPtPerDollar",
  "tierMultiplierBronze",
  "tierMultiplierSilver",
  "tierMultiplierGold",
  "tierMultiplierPlatinum",
  "tierThresholdSilver",
  "tierThresholdGold",
  "tierThresholdPlatinum",
  "updatedAt"
)
SELECT
  "id",
  "earnPtPerDollar",
  "redeemDollarPerPoint",
  "referralPtPerDollar",
  "tierMultiplierBronze",
  "tierMultiplierSilver",
  "tierMultiplierGold",
  "tierMultiplierPlatinum",
  "tierThresholdSilver",
  "tierThresholdGold",
  "tierThresholdPlatinum",
  CURRENT_TIMESTAMP
FROM "BrandConfig"
WHERE "id" = 1;

-- Fail the migration if the new row is not an exact field-for-field copy of
-- BrandConfig, or if the active BusinessConfig compatibility copy is already
-- drifting from BrandConfig. The raised JSON reports the exact differing fields.
DO $$
DECLARE
  policy_row_count INTEGER;
  policy_vs_brand_diff JSONB;
  brand_vs_business_diff JSONB;
BEGIN
  SELECT COUNT(*)
  INTO policy_row_count
  FROM "LoyaltyProgramPolicy"
  WHERE "id" = 1;

  IF policy_row_count <> 1 THEN
    RAISE EXCEPTION
      'LoyaltyProgramPolicy backfill expected exactly one id=1 row; found %',
      policy_row_count;
  END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'earnPtPerDollar', CASE WHEN p."earnPtPerDollar" IS DISTINCT FROM b."earnPtPerDollar" THEN jsonb_build_object('loyaltyProgramPolicy', p."earnPtPerDollar", 'brandConfig', b."earnPtPerDollar") END,
    'redeemDollarPerPoint', CASE WHEN p."redeemDollarPerPoint" IS DISTINCT FROM b."redeemDollarPerPoint" THEN jsonb_build_object('loyaltyProgramPolicy', p."redeemDollarPerPoint", 'brandConfig', b."redeemDollarPerPoint") END,
    'referralPtPerDollar', CASE WHEN p."referralPtPerDollar" IS DISTINCT FROM b."referralPtPerDollar" THEN jsonb_build_object('loyaltyProgramPolicy', p."referralPtPerDollar", 'brandConfig', b."referralPtPerDollar") END,
    'tierMultiplierBronze', CASE WHEN p."tierMultiplierBronze" IS DISTINCT FROM b."tierMultiplierBronze" THEN jsonb_build_object('loyaltyProgramPolicy', p."tierMultiplierBronze", 'brandConfig', b."tierMultiplierBronze") END,
    'tierMultiplierSilver', CASE WHEN p."tierMultiplierSilver" IS DISTINCT FROM b."tierMultiplierSilver" THEN jsonb_build_object('loyaltyProgramPolicy', p."tierMultiplierSilver", 'brandConfig', b."tierMultiplierSilver") END,
    'tierMultiplierGold', CASE WHEN p."tierMultiplierGold" IS DISTINCT FROM b."tierMultiplierGold" THEN jsonb_build_object('loyaltyProgramPolicy', p."tierMultiplierGold", 'brandConfig', b."tierMultiplierGold") END,
    'tierMultiplierPlatinum', CASE WHEN p."tierMultiplierPlatinum" IS DISTINCT FROM b."tierMultiplierPlatinum" THEN jsonb_build_object('loyaltyProgramPolicy', p."tierMultiplierPlatinum", 'brandConfig', b."tierMultiplierPlatinum") END,
    'tierThresholdSilver', CASE WHEN p."tierThresholdSilver" IS DISTINCT FROM b."tierThresholdSilver" THEN jsonb_build_object('loyaltyProgramPolicy', p."tierThresholdSilver", 'brandConfig', b."tierThresholdSilver") END,
    'tierThresholdGold', CASE WHEN p."tierThresholdGold" IS DISTINCT FROM b."tierThresholdGold" THEN jsonb_build_object('loyaltyProgramPolicy', p."tierThresholdGold", 'brandConfig', b."tierThresholdGold") END,
    'tierThresholdPlatinum', CASE WHEN p."tierThresholdPlatinum" IS DISTINCT FROM b."tierThresholdPlatinum" THEN jsonb_build_object('loyaltyProgramPolicy', p."tierThresholdPlatinum", 'brandConfig', b."tierThresholdPlatinum") END
  ))
  INTO policy_vs_brand_diff
  FROM "LoyaltyProgramPolicy" p
  JOIN "BrandConfig" b ON b."id" = p."id"
  WHERE p."id" = 1;

  IF policy_vs_brand_diff <> '{}'::jsonb THEN
    RAISE EXCEPTION
      'LoyaltyProgramPolicy and BrandConfig policy mismatch after backfill: %',
      policy_vs_brand_diff;
  END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'earnPtPerDollar', CASE WHEN b."earnPtPerDollar" IS DISTINCT FROM c."earnPtPerDollar" THEN jsonb_build_object('brandConfig', b."earnPtPerDollar", 'businessConfig', c."earnPtPerDollar") END,
    'redeemDollarPerPoint', CASE WHEN b."redeemDollarPerPoint" IS DISTINCT FROM c."redeemDollarPerPoint" THEN jsonb_build_object('brandConfig', b."redeemDollarPerPoint", 'businessConfig', c."redeemDollarPerPoint") END,
    'referralPtPerDollar', CASE WHEN b."referralPtPerDollar" IS DISTINCT FROM c."referralPtPerDollar" THEN jsonb_build_object('brandConfig', b."referralPtPerDollar", 'businessConfig', c."referralPtPerDollar") END,
    'tierMultiplierBronze', CASE WHEN b."tierMultiplierBronze" IS DISTINCT FROM c."tierMultiplierBronze" THEN jsonb_build_object('brandConfig', b."tierMultiplierBronze", 'businessConfig', c."tierMultiplierBronze") END,
    'tierMultiplierSilver', CASE WHEN b."tierMultiplierSilver" IS DISTINCT FROM c."tierMultiplierSilver" THEN jsonb_build_object('brandConfig', b."tierMultiplierSilver", 'businessConfig', c."tierMultiplierSilver") END,
    'tierMultiplierGold', CASE WHEN b."tierMultiplierGold" IS DISTINCT FROM c."tierMultiplierGold" THEN jsonb_build_object('brandConfig', b."tierMultiplierGold", 'businessConfig', c."tierMultiplierGold") END,
    'tierMultiplierPlatinum', CASE WHEN b."tierMultiplierPlatinum" IS DISTINCT FROM c."tierMultiplierPlatinum" THEN jsonb_build_object('brandConfig', b."tierMultiplierPlatinum", 'businessConfig', c."tierMultiplierPlatinum") END,
    'tierThresholdSilver', CASE WHEN b."tierThresholdSilver" IS DISTINCT FROM c."tierThresholdSilver" THEN jsonb_build_object('brandConfig', b."tierThresholdSilver", 'businessConfig', c."tierThresholdSilver") END,
    'tierThresholdGold', CASE WHEN b."tierThresholdGold" IS DISTINCT FROM c."tierThresholdGold" THEN jsonb_build_object('brandConfig', b."tierThresholdGold", 'businessConfig', c."tierThresholdGold") END,
    'tierThresholdPlatinum', CASE WHEN b."tierThresholdPlatinum" IS DISTINCT FROM c."tierThresholdPlatinum" THEN jsonb_build_object('brandConfig', b."tierThresholdPlatinum", 'businessConfig', c."tierThresholdPlatinum") END
  ))
  INTO brand_vs_business_diff
  FROM "BrandConfig" b
  JOIN "BusinessConfig" c ON c."id" = b."id"
  WHERE b."id" = 1;

  IF brand_vs_business_diff <> '{}'::jsonb THEN
    RAISE EXCEPTION
      'BrandConfig and BusinessConfig Loyalty compatibility mismatch before cutover: %',
      brand_vs_business_diff;
  END IF;
END $$;

COMMIT;
