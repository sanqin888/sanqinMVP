-- Establish a canonical store identity without changing the existing external
-- POS room identifier contract. The current single store is backfilled into a
-- UUID-backed Store row whose stable business identifier remains
-- `4750_Yonge_Street`.

CREATE TABLE "Store" (
  "id" UUID NOT NULL,
  "storeStableId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Store_storeStableId_key" ON "Store"("storeStableId");

CREATE TABLE "BrandConfig" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "brandNameZh" TEXT,
  "brandNameEn" TEXT,
  "siteUrl" TEXT,
  "emailFromNameZh" TEXT,
  "emailFromNameEn" TEXT,
  "emailFromAddress" TEXT,
  "smsSignature" TEXT,
  "supportPhone" TEXT,
  "supportEmail" TEXT,
  "wechatAlipayExchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "earnPtPerDollar" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
  "redeemDollarPerPoint" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "referralPtPerDollar" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
  "tierMultiplierBronze" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "tierMultiplierSilver" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  "tierMultiplierGold" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
  "tierMultiplierPlatinum" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
  "tierThresholdSilver" INTEGER NOT NULL DEFAULT 100000,
  "tierThresholdGold" INTEGER NOT NULL DEFAULT 1000000,
  "tierThresholdPlatinum" INTEGER NOT NULL DEFAULT 3000000,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BrandConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoreConfig" (
  "storeId" UUID NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',
  "isTemporarilyClosed" BOOLEAN NOT NULL DEFAULT false,
  "temporaryCloseReason" TEXT,
  "publicNotice" TEXT,
  "publicNoticeEn" TEXT,
  "deliveryBaseFeeCents" INTEGER NOT NULL DEFAULT 600,
  "priorityPerKmCents" INTEGER NOT NULL DEFAULT 100,
  "maxDeliveryRangeKm" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
  "priorityDefaultDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 6.0,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "province" TEXT,
  "postalCode" TEXT,
  "countryCode" TEXT NOT NULL DEFAULT 'CA',
  "phone" TEXT,
  "contactName" TEXT,
  "salesTaxRate" DOUBLE PRECISION NOT NULL DEFAULT 0.13,
  "enableUberDirect" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StoreConfig_pkey" PRIMARY KEY ("storeId")
);

INSERT INTO "Store" (
  "id",
  "storeStableId",
  "name",
  "isActive",
  "updatedAt"
)
SELECT
  '8a3d4c0e-4750-4f6a-9138-000000000001'::uuid,
  '4750_Yonge_Street',
  COALESCE(NULLIF(BTRIM("storeName"), ''), 'SanQ Roujiamo - Yonge'),
  true,
  CURRENT_TIMESTAMP
FROM "BusinessConfig"
WHERE "id" = 1
ON CONFLICT ("storeStableId") DO NOTHING;

INSERT INTO "Store" (
  "id",
  "storeStableId",
  "name",
  "isActive",
  "updatedAt"
)
SELECT
  '8a3d4c0e-4750-4f6a-9138-000000000001'::uuid,
  '4750_Yonge_Street',
  'SanQ Roujiamo - Yonge',
  true,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "Store" WHERE "storeStableId" = '4750_Yonge_Street'
);

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
FROM "BusinessConfig"
WHERE "id" = 1
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "BrandConfig" ("id", "updatedAt")
SELECT 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "BrandConfig" WHERE "id" = 1);

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
  "countryCode",
  "phone",
  "contactName",
  "salesTaxRate",
  "enableUberDirect",
  "updatedAt"
)
SELECT
  '8a3d4c0e-4750-4f6a-9138-000000000001'::uuid,
  COALESCE(NULLIF(BTRIM("timezone"), ''), 'America/Toronto'),
  "isTemporarilyClosed",
  "temporaryCloseReason",
  "publicNotice",
  "publicNoticeEn",
  "deliveryBaseFeeCents",
  "priorityPerKmCents",
  "maxDeliveryRangeKm",
  "priorityDefaultDistanceKm",
  COALESCE("storeLatitude", 43.760288),
  COALESCE("storeLongitude", -79.412167),
  COALESCE(NULLIF(BTRIM("storeAddressLine1"), ''), '4750 Yonge St.'),
  COALESCE(NULLIF(BTRIM("storeAddressLine2"), ''), 'Unit 138'),
  COALESCE(NULLIF(BTRIM("storeCity"), ''), 'Toronto'),
  COALESCE(NULLIF(BTRIM("storeProvince"), ''), 'ON'),
  COALESCE(NULLIF(BTRIM("storePostalCode"), ''), 'M2N 5M6'),
  'CA',
  COALESCE(NULLIF(BTRIM("supportPhone"), ''), '+1-437-808-6888'),
  'San Qin',
  "salesTaxRate",
  "enableUberDirect",
  CURRENT_TIMESTAMP
FROM "BusinessConfig"
WHERE "id" = 1
ON CONFLICT ("storeId") DO NOTHING;

INSERT INTO "StoreConfig" (
  "storeId",
  "latitude",
  "longitude",
  "addressLine1",
  "addressLine2",
  "city",
  "province",
  "postalCode",
  "countryCode",
  "phone",
  "contactName",
  "updatedAt"
)
SELECT
  '8a3d4c0e-4750-4f6a-9138-000000000001'::uuid,
  43.760288,
  -79.412167,
  '4750 Yonge St.',
  'Unit 138',
  'Toronto',
  'ON',
  'M2N 5M6',
  'CA',
  '+1-437-808-6888',
  'San Qin',
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "StoreConfig"
  WHERE "storeId" = '8a3d4c0e-4750-4f6a-9138-000000000001'::uuid
);

ALTER TABLE "StoreConfig"
ADD CONSTRAINT "StoreConfig_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- PosDevice.storeId has always been a UUID but previously had no Store target.
-- In the current single-store deployment all existing devices belong to the
-- canonical Yonge store, including legacy all-zero placeholder rows.
UPDATE "PosDevice"
SET "storeId" = '8a3d4c0e-4750-4f6a-9138-000000000001'::uuid;

ALTER TABLE "PosDevice"
ADD CONSTRAINT "PosDevice_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve current single-store application behavior while recording explicit
-- ownership. The global weekday uniqueness remains for now and can be replaced
-- by @@unique([storeId, weekday]) during the later whole-site store scoping pass.
ALTER TABLE "BusinessHour"
ADD COLUMN "storeId" UUID NOT NULL
DEFAULT '8a3d4c0e-4750-4f6a-9138-000000000001'::uuid;

CREATE INDEX "BusinessHour_storeId_weekday_idx"
ON "BusinessHour"("storeId", "weekday");

ALTER TABLE "BusinessHour"
ADD CONSTRAINT "BusinessHour_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Holiday"
ADD COLUMN "storeId" UUID NOT NULL
DEFAULT '8a3d4c0e-4750-4f6a-9138-000000000001'::uuid;

CREATE INDEX "Holiday_storeId_date_idx" ON "Holiday"("storeId", "date");

ALTER TABLE "Holiday"
ADD CONSTRAINT "Holiday_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Order.storeId remains the stable POS/external store identifier rather than a
-- UUID. Backfill all historical single-store orders, then make the semantic
-- relationship explicit by referencing Store.storeStableId.
UPDATE "Order"
SET "storeId" = '4750_Yonge_Street'
WHERE "storeId" IS NULL OR "storeId" <> '4750_Yonge_Street';

CREATE INDEX "Order_storeId_idx" ON "Order"("storeId");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("storeStableId")
ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "UberStoreMapping"
SET "posExternalStoreId" = '4750_Yonge_Street'
WHERE "isProvisioned" = true
  AND ("posExternalStoreId" IS NULL OR BTRIM("posExternalStoreId") = '');

-- Transitional compatibility bridge: existing services still write the
-- singleton BusinessConfig. Mirror those writes into the new brand/store
-- configuration boundaries so the canonical rows cannot silently drift while
-- the rest of the application is migrated module-by-module.
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
    NEW."earnPtPerDollar",
    NEW."redeemDollarPerPoint",
    NEW."referralPtPerDollar",
    NEW."tierMultiplierBronze",
    NEW."tierMultiplierSilver",
    NEW."tierMultiplierGold",
    NEW."tierMultiplierPlatinum",
    NEW."tierThresholdSilver",
    NEW."tierThresholdGold",
    NEW."tierThresholdPlatinum",
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
    "earnPtPerDollar" = EXCLUDED."earnPtPerDollar",
    "redeemDollarPerPoint" = EXCLUDED."redeemDollarPerPoint",
    "referralPtPerDollar" = EXCLUDED."referralPtPerDollar",
    "tierMultiplierBronze" = EXCLUDED."tierMultiplierBronze",
    "tierMultiplierSilver" = EXCLUDED."tierMultiplierSilver",
    "tierMultiplierGold" = EXCLUDED."tierMultiplierGold",
    "tierMultiplierPlatinum" = EXCLUDED."tierMultiplierPlatinum",
    "tierThresholdSilver" = EXCLUDED."tierThresholdSilver",
    "tierThresholdGold" = EXCLUDED."tierThresholdGold",
    "tierThresholdPlatinum" = EXCLUDED."tierThresholdPlatinum",
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
    NEW."storeLatitude",
    NEW."storeLongitude",
    NEW."storeAddressLine1",
    NEW."storeAddressLine2",
    NEW."storeCity",
    NEW."storeProvince",
    NEW."storePostalCode",
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

CREATE TRIGGER "BusinessConfig_sync_canonical_config"
AFTER INSERT OR UPDATE ON "BusinessConfig"
FOR EACH ROW
WHEN (NEW."id" = 1)
EXECUTE FUNCTION "syncBusinessConfigToCanonicalConfig"();
