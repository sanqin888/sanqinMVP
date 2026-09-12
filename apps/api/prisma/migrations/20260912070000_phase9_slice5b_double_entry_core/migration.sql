-- Phase 9 Slice 5B: introduce the Accounting-owned double-entry journal core.
-- Current Accounting records are not production accounting history, but the migration
-- remains additive for active runtime paths so later slices can cut over deliberately.

-- CreateEnum
CREATE TYPE "AccountingAccountClass" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountingJournalEntryKind" AS ENUM ('STANDARD', 'ADJUSTMENT', 'TRANSFER', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "AccountingJournalSource" AS ENUM ('MANUAL', 'EXPENSE_DOCUMENT', 'ORDER', 'PAYMENT', 'PLATFORM_STATEMENT', 'SYSTEM');

-- AlterTable
ALTER TABLE "AccountingAccount"
  ADD COLUMN "accountClass" "AccountingAccountClass";

-- Existing Accounting accounts are operational cash/bank/provider-wallet accounts and
-- therefore Assets. The current Accounting data is disposable, but this deterministic
-- backfill keeps the migration safe to apply without deleting setup rows.
UPDATE "AccountingAccount"
SET "accountClass" = 'ASSET'
WHERE "accountClass" IS NULL;

ALTER TABLE "AccountingAccount"
  ALTER COLUMN "accountClass" SET NOT NULL,
  ALTER COLUMN "type" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AccountingJournalEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "entryStableId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "idempotencyHash" TEXT NOT NULL,
  "kind" "AccountingJournalEntryKind" NOT NULL,
  "source" "AccountingJournalSource" NOT NULL,
  "sourceFactType" TEXT,
  "sourceFactStableId" TEXT,
  "sourceFactVersion" INTEGER,
  "storeStableId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CAD',
  "memo" TEXT,
  "createdByUserStableId" TEXT NOT NULL,
  "updatedByUserStableId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "AccountingJournalEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingJournalEntry_source_fact_check" CHECK (
    ("sourceFactType" IS NULL AND "sourceFactStableId" IS NULL AND "sourceFactVersion" IS NULL)
    OR (
      "sourceFactType" IS NOT NULL
      AND "sourceFactStableId" IS NOT NULL
      AND ("sourceFactVersion" IS NULL OR "sourceFactVersion" > 0)
    )
  ),
  CONSTRAINT "AccountingJournalEntry_idempotency_hash_check" CHECK ("idempotencyHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "AccountingJournalEntry_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "AccountingJournalEntry_version_check" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "AccountingJournalLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "entryId" UUID NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "accountId" UUID NOT NULL,
  "categoryId" UUID,
  "debitCents" INTEGER NOT NULL,
  "creditCents" INTEGER NOT NULL,
  "memo" TEXT,

  CONSTRAINT "AccountingJournalLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingJournalLine_line_no_check" CHECK ("lineNo" > 0),
  CONSTRAINT "AccountingJournalLine_debit_credit_check" CHECK (
    "debitCents" >= 0
    AND "creditCents" >= 0
    AND (
      ("debitCents" > 0 AND "creditCents" = 0)
      OR ("creditCents" > 0 AND "debitCents" = 0)
    )
  )
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingJournalEntry_entryStableId_key"
  ON "AccountingJournalEntry"("entryStableId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingJournalEntry_idempotencyKey_key"
  ON "AccountingJournalEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AccountingJournalEntry_occurredAt_idx"
  ON "AccountingJournalEntry"("occurredAt");

-- CreateIndex
CREATE INDEX "AccountingJournalEntry_storeStableId_occurredAt_idx"
  ON "AccountingJournalEntry"("storeStableId", "occurredAt");

-- CreateIndex
CREATE INDEX "AccountingJournalEntry_source_sourceFactType_sourceFactStableId_idx"
  ON "AccountingJournalEntry"("source", "sourceFactType", "sourceFactStableId");

-- CreateIndex
CREATE INDEX "AccountingJournalEntry_deletedAt_idx"
  ON "AccountingJournalEntry"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingJournalLine_entryId_lineNo_key"
  ON "AccountingJournalLine"("entryId", "lineNo");

-- CreateIndex
CREATE INDEX "AccountingJournalLine_accountId_entryId_idx"
  ON "AccountingJournalLine"("accountId", "entryId");

-- CreateIndex
CREATE INDEX "AccountingJournalLine_categoryId_entryId_idx"
  ON "AccountingJournalLine"("categoryId", "entryId");

-- CreateIndex
CREATE INDEX "AccountingAccount_accountClass_isActive_idx"
  ON "AccountingAccount"("accountClass", "isActive");

-- AddForeignKey
ALTER TABLE "AccountingJournalLine"
  ADD CONSTRAINT "AccountingJournalLine_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "AccountingJournalEntry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingJournalLine"
  ADD CONSTRAINT "AccountingJournalLine_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingJournalLine"
  ADD CONSTRAINT "AccountingJournalLine_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "AccountingCategory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- DB-level double-entry invariant. Application code validates before write, while
-- these deferred constraint triggers prevent a direct/partial write from committing
-- an entry with fewer than two lines or unequal debit/credit totals.
CREATE FUNCTION "assertAccountingJournalEntryBalanced"(target_entry UUID)
RETURNS VOID AS $$
DECLARE
  line_count INTEGER;
  debit_total BIGINT;
  credit_total BIGINT;
BEGIN
  IF target_entry IS NULL OR NOT EXISTS (
    SELECT 1 FROM "AccountingJournalEntry" WHERE "id" = target_entry
  ) THEN
    RETURN;
  END IF;

  SELECT COUNT(*), COALESCE(SUM("debitCents"), 0), COALESCE(SUM("creditCents"), 0)
  INTO line_count, debit_total, credit_total
  FROM "AccountingJournalLine"
  WHERE "entryId" = target_entry;

  IF line_count < 2 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'Accounting journal entry % is not balanced: lines %, debit %, credit %',
      target_entry, line_count, debit_total, credit_total
      USING ERRCODE = '23514';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "checkAccountingJournalEntryBalanceTrigger"()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM "assertAccountingJournalEntryBalanced"(NEW."id");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION "checkAccountingJournalLineBalanceTrigger"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "assertAccountingJournalEntryBalanced"(OLD."entryId");
  ELSE
    PERFORM "assertAccountingJournalEntryBalanced"(NEW."entryId");
    IF TG_OP = 'UPDATE' AND OLD."entryId" IS DISTINCT FROM NEW."entryId" THEN
      PERFORM "assertAccountingJournalEntryBalanced"(OLD."entryId");
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "AccountingJournalEntry_balance_check"
AFTER INSERT OR UPDATE ON "AccountingJournalEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "checkAccountingJournalEntryBalanceTrigger"();

CREATE CONSTRAINT TRIGGER "AccountingJournalLine_balance_check"
AFTER INSERT OR UPDATE OR DELETE ON "AccountingJournalLine"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "checkAccountingJournalLineBalanceTrigger"();

-- Seed the minimum system Chart of Accounts. Existing stable IDs are retained;
-- non-system/user-created current rows simply remain Assets and may be discarded later.
INSERT INTO "AccountingAccount"
  ("id", "accountStableId", "name", "type", "accountClass", "currency", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'account_store_cash', '门店现金', 'CASH', 'ASSET', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_primary_bank', '主要银行账户', 'BANK', 'ASSET', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_clover_pending', 'Clover 待结算', 'PLATFORM_WALLET', 'ASSET', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_uber_pending', 'Uber Eats 待结算', 'PLATFORM_WALLET', 'ASSET', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_fantuan_pending', 'Fantuan 待结算', 'PLATFORM_WALLET', 'ASSET', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_hst_recoverable', 'HST/GST 待抵扣', NULL, 'ASSET', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_hst_payable', 'HST/GST 应缴', NULL, 'LIABILITY', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_opening_balance_equity', '期初余额权益', NULL, 'EQUITY', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_sales_revenue', '餐品销售收入', NULL, 'REVENUE', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_delivery_revenue', '配送收入', NULL, 'REVENUE', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_card_surcharge_revenue', '刷卡附加费收入', NULL, 'REVENUE', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_sales_discounts', '销售折扣', NULL, 'REVENUE', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_other_operating_revenue', '其他经营收入', NULL, 'REVENUE', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_general_operating_expense', '一般经营费用', NULL, 'EXPENSE', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_platform_commission_expense', '平台佣金', NULL, 'EXPENSE', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_platform_promotion_expense', '平台促销费用', NULL, 'EXPENSE', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_advertising_expense', '广告费用', NULL, 'EXPENSE', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_payment_processing_fee_expense', '支付处理费', NULL, 'EXPENSE', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'account_chargeback_adjustment_expense', '拒付及平台调整', NULL, 'EXPENSE', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("accountStableId") DO NOTHING;

UPDATE "AccountingAccount"
SET "accountClass" = CASE
  WHEN "accountStableId" IN (
    'account_store_cash',
    'account_primary_bank',
    'account_clover_pending',
    'account_uber_pending',
    'account_fantuan_pending',
    'account_hst_recoverable'
  ) THEN 'ASSET'::"AccountingAccountClass"
  WHEN "accountStableId" = 'account_hst_payable' THEN 'LIABILITY'::"AccountingAccountClass"
  WHEN "accountStableId" = 'account_opening_balance_equity' THEN 'EQUITY'::"AccountingAccountClass"
  WHEN "accountStableId" IN (
    'account_sales_revenue',
    'account_delivery_revenue',
    'account_card_surcharge_revenue',
    'account_sales_discounts',
    'account_other_operating_revenue'
  ) THEN 'REVENUE'::"AccountingAccountClass"
  ELSE 'EXPENSE'::"AccountingAccountClass"
END
WHERE "accountStableId" IN (
  'account_store_cash',
  'account_primary_bank',
  'account_clover_pending',
  'account_uber_pending',
  'account_fantuan_pending',
  'account_hst_recoverable',
  'account_hst_payable',
  'account_opening_balance_equity',
  'account_sales_revenue',
  'account_delivery_revenue',
  'account_card_surcharge_revenue',
  'account_sales_discounts',
  'account_other_operating_revenue',
  'account_general_operating_expense',
  'account_platform_commission_expense',
  'account_platform_promotion_expense',
  'account_advertising_expense',
  'account_payment_processing_fee_expense',
  'account_chargeback_adjustment_expense'
);
