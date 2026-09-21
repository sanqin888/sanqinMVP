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
const EXPENSE_SERVICE = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense.service.ts',
);
const EXPENSE_SPLIT_WRITER = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense-split.writer.ts',
);
const EXPENSE_QUERY = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense.query.ts',
);
const EXPENSE_PREVIEW = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense-journal-preview.service.ts',
);
const EXPENSE_POSTING = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense-journal-posting.service.ts',
);
const JOURNAL_SERVICE = resolve(
  ACCOUNTING_ROOT,
  'accounting-journal.service.ts',
);
const FINANCIAL_REPORTS = resolve(
  ACCOUNTING_ROOT,
  'accounting-financial-reports.service.ts',
);

const modelBody = (schema: string, modelName: string) => {
  const match = schema.match(
    new RegExp(`model ${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) throw new Error(`missing Prisma model ${modelName}`);
  return match[1];
};

describe('Accounting Expense split ownership and Journal boundary', () => {
  it('adds dedicated Expense-owned split persistence without contracting the legacy copy', () => {
    const schema = readFileSync(PRISMA_SCHEMA, 'utf8');
    const expenseDocument = modelBody(schema, 'AccountingExpenseDocument');
    const category = modelBody(schema, 'AccountingCategory');
    const split = modelBody(schema, 'AccountingExpenseSplit');

    expect(expenseDocument).toMatch(/\bsplits\s+AccountingExpenseSplit\[\]/);
    expect(expenseDocument).toMatch(
      /\btransactions\s+AccountingTransaction\[\]/,
    );
    expect(category).toMatch(/\bexpenseSplits\s+AccountingExpenseSplit\[\]/);

    expect(split).toContain('splitStableId');
    expect(split).toContain('expenseDocumentId');
    expect(split).toContain('categoryId');
    expect(split).toContain('amountCents');
    expect(split).toContain('taxCents');
    expect(split).toContain('sortOrder');
    expect(split).toContain('onDelete: Cascade');
    expect(split).toContain('onDelete: Restrict');
    expect(split).toContain('@@unique([expenseDocumentId, sortOrder])');
    expect(split).toContain('@@index([expenseDocumentId])');
    expect(split).toContain('@@index([categoryId])');
  });

  it('keeps the legacy Transaction copy behind one registered compatibility writer', () => {
    const service = readFileSync(EXPENSE_SERVICE, 'utf8');
    const writer = readFileSync(EXPENSE_SPLIT_WRITER, 'utf8');

    expect(service).toContain('createAccountingExpenseSplitCompatibilityInTx');
    expect(service).not.toContain('accountingTransaction.createMany');
    expect(writer).toContain('@compat accounting.expense-split-ownership.v1');
    expect(writer).toContain('accountingExpenseSplit.createMany');
    expect(writer).toContain('accountingTransaction.createMany');
  });

  it('cuts Expense owner reads to AccountingExpenseSplit while retaining legacy parity/report compatibility', () => {
    const query = readFileSync(EXPENSE_QUERY, 'utf8');
    const preview = readFileSync(EXPENSE_PREVIEW, 'utf8');
    const reports = readFileSync(FINANCIAL_REPORTS, 'utf8');

    expect(query).toContain('splits: {');
    expect(query).toContain('row.splits.map');
    expect(query).not.toContain('transactions: {');
    expect(query).not.toContain('txStableId');
    expect(preview).toContain('SPLIT_PERSISTENCE_MISMATCH');
    expect(preview).toContain('document.transactions.map');
    expect(preview).toContain('splits: document.splits.map');
    expect(reports).toContain('accountingTransaction.findMany');
  });

  it('routes canonical Expense Journal writes only through the Expense posting authority', () => {
    const service = readFileSync(EXPENSE_SERVICE, 'utf8');
    const posting = readFileSync(EXPENSE_POSTING, 'utf8');
    const journal = readFileSync(JOURNAL_SERVICE, 'utf8');

    expect(service).toContain('postConfirmedExpenseIfReadyInTx');
    expect(service).not.toContain('createCanonicalExpenseJournalEntryInTx');
    expect(posting).toContain('createCanonicalExpenseJournalEntryInTx');
    expect(journal).toContain('createCanonicalExpenseJournalEntryInTx');
    expect(journal).toContain(
      'canonical Expense Journals require Expense-specific write authority',
    );
    expect(journal).toContain(
      'canonical Expense Journals cannot be updated in place',
    );
    expect(journal).toContain(
      'canonical Expense Journals cannot be deleted in place',
    );
    expect(posting).toContain('SPLIT_PERSISTENCE_MISMATCH');
  });
});
