-- Phase 9 Slice 8P-D0: provision Payroll control accounts.
-- This is an additive Chart-of-Accounts seed only.
-- It intentionally creates no AccountingJournalEntry, opening balance,
-- historical Payroll backfill, employee payment, or CRA remittance fact.

INSERT INTO "AccountingAccount"
  ("id", "accountStableId", "name", "type", "accountClass", "currency", "isActive", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid(),
    'account_payroll_wages_expense',
    '工资费用',
    NULL,
    'EXPENSE',
    'CAD',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'account_payroll_employer_contributions_expense',
    '雇主 CPP/CPP2/EI 费用',
    NULL,
    'EXPENSE',
    'CAD',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'account_payroll_net_pay_payable',
    '应付员工净工资',
    NULL,
    'LIABILITY',
    'CAD',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'account_payroll_income_tax_payable',
    '应付工资所得税',
    NULL,
    'LIABILITY',
    'CAD',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'account_payroll_cpp_payable',
    '应付 CPP/CPP2',
    NULL,
    'LIABILITY',
    'CAD',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'account_payroll_ei_payable',
    '应付 EI',
    NULL,
    'LIABILITY',
    'CAD',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'account_payroll_vacation_payable',
    '应付假期工资',
    NULL,
    'LIABILITY',
    'CAD',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("accountStableId") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "type" = EXCLUDED."type",
  "accountClass" = EXCLUDED."accountClass",
  "currency" = EXCLUDED."currency",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = CURRENT_TIMESTAMP;