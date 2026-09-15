-- Phase 9 Slice 6C-A1: add the non-taxable Store Tip Revenue account.
-- Tips are Store revenue, not employee/customer liability.
-- This is an additive Chart-of-Accounts seed only and intentionally creates
-- no AccountingJournalEntry or historical/opening-balance backfill.

INSERT INTO "AccountingAccount"
  ("id", "accountStableId", "name", "type", "accountClass", "currency", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'account_tip_revenue', '小费收入', NULL, 'REVENUE', 'CAD', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("accountStableId") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "accountClass" = EXCLUDED."accountClass",
  "currency" = EXCLUDED."currency",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = CURRENT_TIMESTAMP;