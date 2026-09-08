-- Migration-history replay repair for Prisma shadow / fresh databases.
--
-- Historical production databases already had the singleton BusinessConfig(id=1)
-- before the Brand/Store expand migrations were introduced. A database rebuilt
-- only from migration files does not: 20251209205319_add_admin created the table
-- but never inserted the singleton row. That makes the later Loyalty readiness
-- migration fail while replaying history from an empty database.
--
-- This repair intentionally sits immediately after
-- 20260819233000_add_store_config_foundation, where the canonical BrandConfig,
-- Store, StoreConfig rows and BusinessConfig -> canonical sync trigger already
-- exist. It only synthesizes the missing compatibility row for an otherwise
-- empty legacy table. Existing historical data is never overwritten.
--
-- On current production the BusinessConfig table has already been contracted
-- away, so this migration is deliberately a no-op when that table is absent.

DO $$
DECLARE
  business_config_table REGCLASS;
  total_row_count INTEGER;
  id1_row_count INTEGER;
BEGIN
  business_config_table := to_regclass(
    format('%I.%I', current_schema(), 'BusinessConfig')
  );

  -- Current production reaches this branch: BusinessConfig was removed by
  -- 20260902044000_contract_brand_store_business_config. Avoid even preparing
  -- SQL against the removed table so this pending historical repair is safe to
  -- record after the contraction has already happened.
  IF business_config_table IS NULL THEN
    RAISE NOTICE 'BusinessConfig replay repair: table already contracted; no-op';
    RETURN;
  END IF;

  EXECUTE format('SELECT count(*) FROM %s', business_config_table)
  INTO total_row_count;

  EXECUTE format(
    'SELECT count(*) FROM %s WHERE "id" = 1',
    business_config_table
  )
  INTO id1_row_count;

  -- Preserve any genuine historical singleton exactly as-is.
  IF total_row_count = 1 AND id1_row_count = 1 THEN
    RAISE NOTICE 'BusinessConfig replay repair: compatibility singleton already exists; no-op';
    RETURN;
  END IF;

  -- The repair is only allowed to synthesize the row in the exact state
  -- produced by a clean migration replay: an existing but empty legacy table.
  -- Anything else is unexpected data and must fail closed rather than be
  -- normalized or overwritten by a history-repair migration.
  IF total_row_count <> 0 OR id1_row_count <> 0 THEN
    RAISE EXCEPTION
      'BusinessConfig replay repair blocked: expected empty table or exactly one id=1 row; total=%, id1=%',
      total_row_count,
      id1_row_count;
  END IF;

  IF to_regclass(format('%I.%I', current_schema(), 'BrandConfig')) IS NULL
     OR to_regclass(format('%I.%I', current_schema(), 'Store')) IS NULL
     OR to_regclass(format('%I.%I', current_schema(), 'StoreConfig')) IS NULL THEN
    RAISE EXCEPTION
      'BusinessConfig replay repair blocked: canonical Brand/Store foundation is missing';
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
    RAISE EXCEPTION
      'BusinessConfig replay repair blocked: canonical compatibility sync trigger is missing';
  END IF;

  -- Match the deterministic canonical fallback values established by
  -- 20260819233000_add_store_config_foundation. The existing AFTER INSERT
  -- trigger immediately mirrors these values back into BrandConfig/StoreConfig,
  -- leaving the compatibility pair at zero drift for later readiness checks.
  EXECUTE format($sql$
    INSERT INTO %s (
      "id",
      "storeName",
      "timezone",
      "isTemporarilyClosed",
      "temporaryCloseReason",
      "deliveryBaseFeeCents",
      "priorityPerKmCents",
      "salesTaxRate",
      "earnPtPerDollar",
      "enableUberDirect",
      "maxDeliveryRangeKm",
      "priorityDefaultDistanceKm",
      "redeemDollarPerPoint",
      "referralPtPerDollar",
      "storeLatitude",
      "storeLongitude",
      "supportEmail",
      "supportPhone",
      "tierThresholdGold",
      "tierThresholdPlatinum",
      "tierThresholdSilver",
      "storeAddressLine1",
      "storeAddressLine2",
      "storeCity",
      "storePostalCode",
      "storeProvince",
      "wechatAlipayExchangeRate",
      "publicNotice",
      "publicNoticeEn",
      "tierMultiplierBronze",
      "tierMultiplierGold",
      "tierMultiplierPlatinum",
      "tierMultiplierSilver",
      "brandNameEn",
      "brandNameZh",
      "emailFromAddress",
      "emailFromNameEn",
      "emailFromNameZh",
      "siteUrl",
      "smsSignature",
      "updatedAt"
    ) VALUES (
      1,
      'SanQ Roujiamo - Yonge',
      'America/Toronto',
      false,
      NULL,
      600,
      100,
      0.13,
      0.01,
      true,
      10.0,
      6.0,
      1.0,
      0.01,
      43.760288,
      -79.412167,
      NULL,
      '+1-437-808-6888',
      1000000,
      3000000,
      100000,
      '4750 Yonge St.',
      'Unit 138',
      'Toronto',
      'M2N 5M6',
      'ON',
      1.0,
      NULL,
      NULL,
      1.0,
      3.0,
      5.0,
      2.0,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      CURRENT_TIMESTAMP
    )
  $sql$, business_config_table);

  EXECUTE format(
    'SELECT count(*) FROM %s WHERE "id" = 1',
    business_config_table
  )
  INTO id1_row_count;

  IF id1_row_count <> 1 THEN
    RAISE EXCEPTION
      'BusinessConfig replay repair incomplete: expected exactly one id=1 row after insert; found %',
      id1_row_count;
  END IF;
END $$;
