import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = __dirname;
const PRISMA_SCHEMA = resolve(
  ACCOUNTING_ROOT,
  '..',
  '..',
  'prisma',
  'schema.prisma',
);
const CHART_SERVICE = resolve(ACCOUNTING_ROOT, 'accounting-chart.service.ts');
const EXPENSE_CONTRACT = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense.contracts.ts',
);
const EXPENSE_POLICY = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense-journal.policy.ts',
);
const EXPENSE_POSTING = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense-journal-posting.service.ts',
);
const EXPENSE_WRITE_AUTHORITY = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense-journal-write-authority.ts',
);
const JOURNAL_SERVICE = resolve(
  ACCOUNTING_ROOT,
  'accounting-journal.service.ts',
);

const modelBody = (schema: string, modelName: string) => {
  const match = schema.match(
    new RegExp(`model ${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) throw new Error(`missing Prisma model ${modelName}`);
  return match[1];
};

describe('Accounting Expense funding attribution foundation', () => {
  it('adds an additive v2 funding seam without changing historical v1 ownership', () => {
    const schema = readFileSync(PRISMA_SCHEMA, 'utf8');
    const expenseDocument = modelBody(schema, 'AccountingExpenseDocument');
    const split = modelBody(schema, 'AccountingExpenseSplit');
    const allocation = modelBody(schema, 'AccountingExpensePaymentAllocation');

    expect(expenseDocument).toMatch(
      /fundingAttributionVersion\s+Int\?\s+@default\(1\)/,
    );
    expect(expenseDocument).toMatch(
      /paymentAllocations\s+AccountingExpensePaymentAllocation\[\]/,
    );

    expect(split).toMatch(/paidFromAccountId\s+String\?/);
    expect(split).toMatch(
      /paidFromAccount\s+AccountingAccount\?\s+@relation\("AccountingExpenseFundingAccount", fields: \[paidFromAccountId\], references: \[id\], onDelete: Restrict\)/,
    );
    expect(split).toContain('@@index([paidFromAccountId])');

    expect(allocation).toContain('paymentAllocationStableId');
    expect(allocation).toContain('accountId');
  });

  it('stores the management-report policy on the funding account, not JournalLine', () => {
    const schema = readFileSync(PRISMA_SCHEMA, 'utf8');
    const account = modelBody(schema, 'AccountingAccount');
    const journalLine = modelBody(schema, 'AccountingJournalLine');

    expect(account).toMatch(
      /includeFundedExpensesInManagementReports\s+Boolean\?\s+@default\(true\)/,
    );
    expect(account).toMatch(
      /fundedExpenseSplits\s+AccountingExpenseSplit\[\]\s+@relation\("AccountingExpenseFundingAccount"\)/,
    );
    expect(journalLine).not.toContain('paidFromAccountId');
    expect(journalLine).not.toContain(
      'includeFundedExpensesInManagementReports',
    );
  });

  it('cuts current Expense writes to split funding while retaining explicit v1 completion contracts', () => {
    const chartService = readFileSync(CHART_SERVICE, 'utf8');
    const expenseContract = readFileSync(EXPENSE_CONTRACT, 'utf8');
    const expensePolicy = readFileSync(EXPENSE_POLICY, 'utf8');

    expect(chartService).toContain('includeFundedExpensesInManagementReports');
    expect(chartService).toContain(
      'row.includeFundedExpensesInManagementReports ?? true',
    );
    expect(chartService).toContain('updateAccountExpenseManagementPolicy');
    expect(expenseContract).toContain(
      'paidFromAccountStableId: string | null',
    );
    expect(expenseContract).not.toContain(
      'paymentAllocations?: AccountingExpensePaymentAllocationInput[]',
    );
    expect(expenseContract).toContain(
      'AccountingExpensePaymentCompletionInput',
    );
    expect(expenseContract).toContain(
      'AccountingExpenseSplitFundingCompletionInput',
    );
    expect(expensePolicy).toContain('accounting.expense_document.v1');
    expect(expensePolicy).toContain(
      'idempotencyKey: `canonical-expense:${documentStableId}:v1`',
    );
  });

  it('pins the v2 grouped-posting boundary without mutating historical v1 authority', () => {
    const expensePolicy = readFileSync(EXPENSE_POLICY, 'utf8');
    const expensePosting = readFileSync(EXPENSE_POSTING, 'utf8');
    const expenseWriteAuthority = readFileSync(EXPENSE_WRITE_AUTHORITY, 'utf8');
    const journalService = readFileSync(JOURNAL_SERVICE, 'utf8');

    expect(expensePolicy).toContain('accounting.expense_document.v1');
    expect(expensePolicy).toContain('accounting.expense_document.v2');
    expect(expensePolicy).toContain(
      'canonical-expense:${documentStableId}:funding:${group.accountStableId}:v2',
    );
    expect(expensePosting).toContain('fundingAttributionVersion === 1');
    expect(expensePosting).toContain('fundingAttributionVersion !== 2');
    expect(expensePosting).toContain(
      'Expense v2 cannot retain legacy document-level payment allocations',
    );
    expect(expenseWriteAuthority).toContain(
      'buildCanonicalExpenseJournalWritePlansV2',
    );
    expect(expenseWriteAuthority).toContain(
      'AccountingAccountType.PLATFORM_WALLET',
    );
    expect(journalService).toContain(
      'canonical Expense source fact version cannot change after Journal posting',
    );
  });
});
