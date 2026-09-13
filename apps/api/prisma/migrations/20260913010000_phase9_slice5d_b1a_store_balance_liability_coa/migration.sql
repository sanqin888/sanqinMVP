-- Phase 9 Slice 5D-B1A: add the Store Balance customer-funds liability account.
-- This is an additive Chart-of-Accounts seed only. The cleaned historical opening
-- Store Balance principal is zero, so this migration intentionally creates no
-- AccountingJournalEntry or historical balance backfill.

INSERT INTO "AccountingAccount"
  ("id", "accountStableId", "name", "type", "accountClass", "currency", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'account_store_balance_liability', '储值余额负债', NULL, 'LIABILITY', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("accountStableId") DO UPDATE
SET "accountClass" = EXCLUDED."accountClass";
