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

describe('Accounting B1-C Expense report parity and cutover boundary', () => {
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

  it('keeps authoritative reports on canonical Journal facts after B1-C1 cutover', () => {
    const reports = readFileSync(REPORTS_SERVICE, 'utf8');

    expect(reports).not.toContain(
      'source: { not: AccountingJournalSource.EXPENSE_DOCUMENT }',
    );
    expect(reports).not.toContain('accountingTransaction.findMany');
    expect(reports).not.toContain(
      'accountingExpensePaymentAllocation.findMany',
    );
  });

  it('stops the legacy Expense Transaction compatibility writer after B1-C1 cutover', () => {
    const writer = readFileSync(EXPENSE_SPLIT_WRITER, 'utf8');

    expect(writer).toContain('accountingExpenseSplit.createMany');
    expect(writer).not.toContain('accountingTransaction.createMany');
  });
});
