-- Accounting External Sales Slice B2: normalize commission semantics and provision Accounts Receivable.
-- User explicitly authorized this one data-only migration to be authored in-repo.
--
-- Safety contract:
-- - preserve the existing commission AccountingAccount UUID in place;
-- - do not rewrite AccountingJournalEntry or AccountingJournalLine;
-- - fail closed on unexpected legacy shape or any target stable-ID/name conflict;
-- - add Accounts Receivable only when no conflicting stable ID or display name exists;
-- - create no historical posting and perform no External Sale backfill.

DO $$
DECLARE
  legacy_commission_id UUID;
  legacy_commission_count INTEGER;
  legacy_shape_count INTEGER;
  target_commission_id_count INTEGER;
  target_commission_name_count INTEGER;
  receivable_id_count INTEGER;
  receivable_name_count INTEGER;
  legacy_journal_line_count BIGINT;
  post_journal_line_count BIGINT;
  updated_count INTEGER;
  inserted_count INTEGER;
  post_commission_count INTEGER;
  post_receivable_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO legacy_commission_count
  FROM "AccountingAccount"
  WHERE "accountStableId" = 'account_platform_commission_expense';

  IF legacy_commission_count <> 1 THEN
    RAISE EXCEPTION
      'B2 CoA normalization expected exactly one legacy commission account, found %',
      legacy_commission_count;
  END IF;

  SELECT "id"
  INTO legacy_commission_id
  FROM "AccountingAccount"
  WHERE "accountStableId" = 'account_platform_commission_expense';

  SELECT COUNT(*)
  INTO legacy_shape_count
  FROM "AccountingAccount"
  WHERE "id" = legacy_commission_id
    AND "accountStableId" = 'account_platform_commission_expense'
    AND "name" = '平台佣金'
    AND "type" IS NULL
    AND "accountClass" = 'EXPENSE'
    AND "currency" = 'CAD'
    AND "isActive" = true;

  IF legacy_shape_count <> 1 THEN
    RAISE EXCEPTION
      'B2 CoA normalization legacy commission account has an unexpected shape';
  END IF;

  SELECT COUNT(*)
  INTO target_commission_id_count
  FROM "AccountingAccount"
  WHERE "accountStableId" = 'account_commission_expense';

  IF target_commission_id_count <> 0 THEN
    RAISE EXCEPTION
      'B2 CoA normalization target commission stable ID already exists';
  END IF;

  SELECT COUNT(*)
  INTO target_commission_name_count
  FROM "AccountingAccount"
  WHERE "name" = '佣金费用';

  IF target_commission_name_count <> 0 THEN
    RAISE EXCEPTION
      'B2 CoA normalization target commission display name already exists';
  END IF;

  SELECT COUNT(*)
  INTO receivable_id_count
  FROM "AccountingAccount"
  WHERE "accountStableId" = 'account_accounts_receivable';

  IF receivable_id_count <> 0 THEN
    RAISE EXCEPTION
      'B2 CoA normalization Accounts Receivable stable ID already exists';
  END IF;

  SELECT COUNT(*)
  INTO receivable_name_count
  FROM "AccountingAccount"
  WHERE "name" = '应收账款';

  IF receivable_name_count <> 0 THEN
    RAISE EXCEPTION
      'B2 CoA normalization Accounts Receivable display name already exists';
  END IF;

  SELECT COUNT(*)
  INTO legacy_journal_line_count
  FROM "AccountingJournalLine"
  WHERE "accountId" = legacy_commission_id;

  UPDATE "AccountingAccount"
  SET
    "accountStableId" = 'account_commission_expense',
    "name" = '佣金费用',
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = legacy_commission_id
    AND "accountStableId" = 'account_platform_commission_expense';

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count <> 1 THEN
    RAISE EXCEPTION
      'B2 CoA normalization failed to update exactly one commission account';
  END IF;

  SELECT COUNT(*)
  INTO post_commission_count
  FROM "AccountingAccount"
  WHERE "id" = legacy_commission_id
    AND "accountStableId" = 'account_commission_expense'
    AND "name" = '佣金费用'
    AND "type" IS NULL
    AND "accountClass" = 'EXPENSE'
    AND "currency" = 'CAD'
    AND "isActive" = true;

  IF post_commission_count <> 1 THEN
    RAISE EXCEPTION
      'B2 CoA normalization commission postcondition failed';
  END IF;

  SELECT COUNT(*)
  INTO post_journal_line_count
  FROM "AccountingJournalLine"
  WHERE "accountId" = legacy_commission_id;

  IF post_journal_line_count <> legacy_journal_line_count THEN
    RAISE EXCEPTION
      'B2 CoA normalization changed commission JournalLine ownership: before %, after %',
      legacy_journal_line_count,
      post_journal_line_count;
  END IF;

  INSERT INTO "AccountingAccount"
    (
      "id",
      "accountStableId",
      "name",
      "type",
      "accountClass",
      "currency",
      "isActive",
      "createdAt",
      "updatedAt"
    )
  VALUES
    (
      gen_random_uuid(),
      'account_accounts_receivable',
      '应收账款',
      NULL,
      'ASSET',
      'CAD',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count <> 1 THEN
    RAISE EXCEPTION
      'B2 CoA normalization failed to insert exactly one Accounts Receivable account';
  END IF;

  SELECT COUNT(*)
  INTO post_receivable_count
  FROM "AccountingAccount"
  WHERE "accountStableId" = 'account_accounts_receivable'
    AND "name" = '应收账款'
    AND "type" IS NULL
    AND "accountClass" = 'ASSET'
    AND "currency" = 'CAD'
    AND "isActive" = true;

  IF post_receivable_count <> 1 THEN
    RAISE EXCEPTION
      'B2 CoA normalization Accounts Receivable postcondition failed';
  END IF;
END
$$;
