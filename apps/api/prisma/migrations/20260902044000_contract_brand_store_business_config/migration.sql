-- Brand/Store final BusinessConfig persistence contraction.
-- Application reads/writes are already canonical through BrandConfig/StoreConfig,
-- and production verification proved the compatibility mirror no longer moves.
-- Fail closed unless the legacy row is still a zero-diff copy with exactly the
-- expected trigger/function and no external database dependencies.

BEGIN;

DO $$
BEGIN
  IF to_regclass(format('%I.%I', current_schema(), 'BusinessConfig')) IS NULL THEN
    RAISE EXCEPTION 'Brand/Store BusinessConfig contraction blocked: BusinessConfig table is missing';
  END IF;
END;
$$;

-- Freeze the legacy row and its canonical counterparts while parity/dependency
-- preconditions are checked and the destructive DDL is performed.
LOCK TABLE "BusinessConfig" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "BrandConfig", "Store", "StoreConfig" IN SHARE MODE;

DO $$
DECLARE
  business_config_oid OID;
  business_row_count BIGINT;
  business_id1_count BIGINT;
  brand_id1_count BIGINT;
  store_count BIGINT;
  store_config_count BIGINT;
  non_internal_trigger_count BIGINT;
  sync_function_count BIGINT;
  sync_trigger_usage_count BIGINT;
  foreign_key_dependency_count BIGINT;
  dependent_view_count BIGINT;
  unexpected_routine_count BIGINT;
  business_row RECORD;
  brand_row RECORD;
  store_row RECORD;
  store_config_row RECORD;
  mismatched_fields TEXT[];
BEGIN
  business_config_oid := to_regclass(format('%I.%I', current_schema(), 'BusinessConfig'))::oid;

  SELECT count(*) INTO business_row_count FROM "BusinessConfig";
  SELECT count(*) INTO business_id1_count FROM "BusinessConfig" WHERE "id" = 1;
  SELECT count(*) INTO brand_id1_count FROM "BrandConfig" WHERE "id" = 1;
  SELECT count(*) INTO store_count
  FROM "Store"
  WHERE "storeStableId" = '4750_Yonge_Street';
  SELECT count(*) INTO store_config_count
  FROM "StoreConfig" sc
  JOIN "Store" s ON s."id" = sc."storeId"
  WHERE s."storeStableId" = '4750_Yonge_Street';

  IF business_row_count <> 1 OR business_id1_count <> 1 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction blocked: expected exactly one BusinessConfig(id=1) row; total=%, id1=%',
      business_row_count,
      business_id1_count;
  END IF;
  IF brand_id1_count <> 1 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction blocked: expected exactly one BrandConfig(id=1) row; found %',
      brand_id1_count;
  END IF;
  IF store_count <> 1 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction blocked: expected exactly one Store(4750_Yonge_Street) row; found %',
      store_count;
  END IF;
  IF store_config_count <> 1 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction blocked: expected exactly one StoreConfig for 4750_Yonge_Street; found %',
      store_config_count;
  END IF;

  SELECT * INTO business_row FROM "BusinessConfig" WHERE "id" = 1;
  SELECT * INTO brand_row FROM "BrandConfig" WHERE "id" = 1;
  SELECT * INTO store_row
  FROM "Store"
  WHERE "storeStableId" = '4750_Yonge_Street';
  SELECT sc.* INTO store_config_row
  FROM "StoreConfig" sc
  JOIN "Store" s ON s."id" = sc."storeId"
  WHERE s."storeStableId" = '4750_Yonge_Street';

  mismatched_fields := array_remove(ARRAY[
    CASE WHEN business_row."storeName" IS DISTINCT FROM store_row."name" THEN 'storeName' END,
    CASE WHEN business_row."timezone" IS DISTINCT FROM store_config_row."timezone" THEN 'timezone' END,
    CASE WHEN business_row."isTemporarilyClosed" IS DISTINCT FROM store_config_row."isTemporarilyClosed" THEN 'isTemporarilyClosed' END,
    CASE WHEN business_row."temporaryCloseReason" IS DISTINCT FROM store_config_row."temporaryCloseReason" THEN 'temporaryCloseReason' END,
    CASE WHEN business_row."publicNotice" IS DISTINCT FROM store_config_row."publicNotice" THEN 'publicNotice' END,
    CASE WHEN business_row."publicNoticeEn" IS DISTINCT FROM store_config_row."publicNoticeEn" THEN 'publicNoticeEn' END,
    CASE WHEN business_row."deliveryBaseFeeCents" IS DISTINCT FROM store_config_row."deliveryBaseFeeCents" THEN 'deliveryBaseFeeCents' END,
    CASE WHEN business_row."priorityPerKmCents" IS DISTINCT FROM store_config_row."priorityPerKmCents" THEN 'priorityPerKmCents' END,
    CASE WHEN business_row."maxDeliveryRangeKm" IS DISTINCT FROM store_config_row."maxDeliveryRangeKm" THEN 'maxDeliveryRangeKm' END,
    CASE WHEN business_row."priorityDefaultDistanceKm" IS DISTINCT FROM store_config_row."priorityDefaultDistanceKm" THEN 'priorityDefaultDistanceKm' END,
    CASE WHEN business_row."storeLatitude" IS DISTINCT FROM store_config_row."latitude" THEN 'storeLatitude' END,
    CASE WHEN business_row."storeLongitude" IS DISTINCT FROM store_config_row."longitude" THEN 'storeLongitude' END,
    CASE WHEN business_row."storeAddressLine1" IS DISTINCT FROM store_config_row."addressLine1" THEN 'storeAddressLine1' END,
    CASE WHEN business_row."storeAddressLine2" IS DISTINCT FROM store_config_row."addressLine2" THEN 'storeAddressLine2' END,
    CASE WHEN business_row."storeCity" IS DISTINCT FROM store_config_row."city" THEN 'storeCity' END,
    CASE WHEN business_row."storeProvince" IS DISTINCT FROM store_config_row."province" THEN 'storeProvince' END,
    CASE WHEN business_row."storePostalCode" IS DISTINCT FROM store_config_row."postalCode" THEN 'storePostalCode' END,
    CASE WHEN business_row."brandNameZh" IS DISTINCT FROM brand_row."brandNameZh" THEN 'brandNameZh' END,
    CASE WHEN business_row."brandNameEn" IS DISTINCT FROM brand_row."brandNameEn" THEN 'brandNameEn' END,
    CASE WHEN business_row."siteUrl" IS DISTINCT FROM brand_row."siteUrl" THEN 'siteUrl' END,
    CASE WHEN business_row."emailFromNameZh" IS DISTINCT FROM brand_row."emailFromNameZh" THEN 'emailFromNameZh' END,
    CASE WHEN business_row."emailFromNameEn" IS DISTINCT FROM brand_row."emailFromNameEn" THEN 'emailFromNameEn' END,
    CASE WHEN business_row."emailFromAddress" IS DISTINCT FROM brand_row."emailFromAddress" THEN 'emailFromAddress' END,
    CASE WHEN business_row."smsSignature" IS DISTINCT FROM brand_row."smsSignature" THEN 'smsSignature' END,
    CASE WHEN business_row."supportPhone" IS DISTINCT FROM brand_row."supportPhone" THEN 'supportPhone' END,
    CASE WHEN business_row."supportEmail" IS DISTINCT FROM brand_row."supportEmail" THEN 'supportEmail' END,
    CASE WHEN business_row."salesTaxRate" IS DISTINCT FROM store_config_row."salesTaxRate" THEN 'salesTaxRate' END,
    CASE WHEN business_row."wechatAlipayExchangeRate" IS DISTINCT FROM brand_row."wechatAlipayExchangeRate" THEN 'wechatAlipayExchangeRate' END,
    CASE WHEN business_row."enableUberDirect" IS DISTINCT FROM store_config_row."enableUberDirect" THEN 'enableUberDirect' END
  ], NULL);

  IF cardinality(mismatched_fields) > 0 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction blocked: persistence drift detected in fields: %',
      array_to_string(mismatched_fields, ', ');
  END IF;

  SELECT count(*) INTO non_internal_trigger_count
  FROM pg_trigger t
  WHERE t.tgrelid = business_config_oid
    AND NOT t.tgisinternal;

  IF non_internal_trigger_count <> 1 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction blocked: expected exactly one non-internal BusinessConfig trigger; found %',
      non_internal_trigger_count;
  END IF;

  SELECT count(*) INTO sync_function_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = current_schema()
    AND p.proname = 'syncBusinessConfigToCanonicalConfig'
    AND p.pronargs = 0;

  IF sync_function_count <> 1 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction blocked: expected exactly one syncBusinessConfigToCanonicalConfig() function; found %',
      sync_function_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE t.tgrelid = business_config_oid
      AND t.tgname = 'BusinessConfig_sync_canonical_config'
      AND NOT t.tgisinternal
      AND n.nspname = current_schema()
      AND p.proname = 'syncBusinessConfigToCanonicalConfig'
      AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION 'Brand/Store BusinessConfig contraction blocked: expected trigger/function binding is missing';
  END IF;

  SELECT count(*) INTO sync_trigger_usage_count
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE NOT t.tgisinternal
    AND n.nspname = current_schema()
    AND p.proname = 'syncBusinessConfigToCanonicalConfig'
    AND p.pronargs = 0;

  IF sync_trigger_usage_count <> 1 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction blocked: sync function has unexpected trigger usage count %',
      sync_trigger_usage_count;
  END IF;

  SELECT count(*) INTO foreign_key_dependency_count
  FROM pg_constraint con
  WHERE con.contype = 'f'
    AND (con.conrelid = business_config_oid OR con.confrelid = business_config_oid);

  IF foreign_key_dependency_count <> 0 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction blocked: unexpected foreign-key dependencies found: %',
      foreign_key_dependency_count;
  END IF;

  SELECT count(DISTINCT dependent_relation.oid) INTO dependent_view_count
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid
  JOIN pg_class dependent_relation ON dependent_relation.oid = r.ev_class
  WHERE d.refobjid = business_config_oid
    AND dependent_relation.relkind IN ('v', 'm');

  IF dependent_view_count <> 0 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction blocked: dependent views/materialized views found: %',
      dependent_view_count;
  END IF;

  SELECT count(*) INTO unexpected_routine_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = current_schema()
    AND p.prokind = 'f'
    AND p.proname <> 'syncBusinessConfigToCanonicalConfig'
    AND pg_get_functiondef(p.oid) ILIKE '%BusinessConfig%';

  IF unexpected_routine_count <> 0 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction blocked: unexpected routines still reference BusinessConfig: %',
      unexpected_routine_count;
  END IF;
END;
$$;

-- Exact contraction order. Do not add CASCADE: any unanticipated dependency
-- must abort deployment rather than be removed implicitly.
DROP TRIGGER "BusinessConfig_sync_canonical_config" ON "BusinessConfig";
DROP FUNCTION "syncBusinessConfigToCanonicalConfig"();
DROP TABLE "BusinessConfig";

DO $$
DECLARE
  remaining_sync_functions BIGINT;
  remaining_named_triggers BIGINT;
  brand_id1_count BIGINT;
  store_count BIGINT;
  store_config_count BIGINT;
BEGIN
  IF to_regclass(format('%I.%I', current_schema(), 'BusinessConfig')) IS NOT NULL THEN
    RAISE EXCEPTION 'Brand/Store BusinessConfig contraction incomplete: BusinessConfig table still exists';
  END IF;

  SELECT count(*) INTO remaining_sync_functions
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = current_schema()
    AND p.proname = 'syncBusinessConfigToCanonicalConfig'
    AND p.pronargs = 0;

  IF remaining_sync_functions <> 0 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction incomplete: sync function still exists: %',
      remaining_sync_functions;
  END IF;

  SELECT count(*) INTO remaining_named_triggers
  FROM pg_trigger t
  WHERE t.tgname = 'BusinessConfig_sync_canonical_config'
    AND NOT t.tgisinternal;

  IF remaining_named_triggers <> 0 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction incomplete: named trigger still exists: %',
      remaining_named_triggers;
  END IF;

  SELECT count(*) INTO brand_id1_count FROM "BrandConfig" WHERE "id" = 1;
  SELECT count(*) INTO store_count
  FROM "Store"
  WHERE "storeStableId" = '4750_Yonge_Street';
  SELECT count(*) INTO store_config_count
  FROM "StoreConfig" sc
  JOIN "Store" s ON s."id" = sc."storeId"
  WHERE s."storeStableId" = '4750_Yonge_Street';

  IF brand_id1_count <> 1 OR store_count <> 1 OR store_config_count <> 1 THEN
    RAISE EXCEPTION
      'Brand/Store BusinessConfig contraction incomplete: canonical rows missing after drop; brand=%, store=%, storeConfig=%',
      brand_id1_count,
      store_count,
      store_config_count;
  END IF;
END;
$$;

COMMIT;
