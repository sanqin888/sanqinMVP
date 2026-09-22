import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCOUNTING_ROOT = __dirname;
const PARITY_SERVICE = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense-report-parity.service.ts',
);
const REPORTS_SERVICE = resolve(
  ACCOUNTING_ROOT,
  'accounting-financial-reports.service.ts',
);
const EXPENSE_SPLIT_WRITER = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense-split.writer.ts',
);

describe('Accounting B1-C0 Expense report parity gate', () => {
  it('keeps the parity preview read-only across legacy and canonical sources', () => {
    const parity = readFileSync(PARITY_SERVICE, 'utf8');

    expect(parity).toContain('accountingExpenseDocument.findMany');
    expect(parity).toContain('accountingJournalEntry.findMany');
    expect(parity).toContain('SPLIT_PERSISTENCE_MISMATCH');
    expect(parity).toContain('NO_CONFIRMED_EXPENSE_EVIDENCE');
    expect(parity).not.toMatch(
      /accounting(?:Transaction|JournalEntry|ExpenseDocument|ExpenseSplit)\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/,
    );
  });

  it('does not perform the authoritative report cutover before production parity evidence exists', () => {
    const reports = readFileSync(REPORTS_SERVICE, 'utf8');

    expect(reports).toContain(
      'source: { not: AccountingJournalSource.EXPENSE_DOCUMENT }',
    );
    expect(reports).toContain('accountingTransaction.findMany');
    expect(reports).toContain('accountingExpensePaymentAllocation.findMany');
  });

  it('does not stop the registered legacy Expense compatibility writer in C0', () => {
    const writer = readFileSync(EXPENSE_SPLIT_WRITER, 'utf8');

    expect(writer).toContain('@compat accounting.expense-split-ownership.v1');
    expect(writer).toContain('accountingExpenseSplit.createMany');
    expect(writer).toContain('accountingTransaction.createMany');
  });
});
