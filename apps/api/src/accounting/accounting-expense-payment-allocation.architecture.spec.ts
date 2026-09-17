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
const OPERATIONS_SERVICE = resolve(
  ACCOUNTING_ROOT,
  'accounting-operations.service.ts',
);
const ACCOUNTING_SERVICE = resolve(ACCOUNTING_ROOT, 'accounting.service.ts');

const modelBody = (schema: string, modelName: string) => {
  const match = schema.match(
    new RegExp(`model ${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (!match) throw new Error(`missing Prisma model ${modelName}`);
  return match[1];
};

describe('Accounting Expense payment allocation boundary', () => {
  it('keeps ExpenseDocument payment ownership in the dedicated allocation model', () => {
    const schema = readFileSync(PRISMA_SCHEMA, 'utf8');
    const expenseDocument = modelBody(schema, 'AccountingExpenseDocument');
    const account = modelBody(schema, 'AccountingAccount');
    const allocation = modelBody(schema, 'AccountingExpensePaymentAllocation');

    expect(expenseDocument).not.toMatch(/\baccountId\b/);
    expect(expenseDocument).not.toMatch(/\baccount\s+AccountingAccount/);
    expect(expenseDocument).toMatch(
      /\bpaymentAllocations\s+AccountingExpensePaymentAllocation\[\]/,
    );
    expect(account).not.toMatch(/\bexpenseDocuments\b/);
    expect(account).toMatch(
      /\bexpensePaymentAllocations\s+AccountingExpensePaymentAllocation\[\]/,
    );

    expect(allocation).toContain('paymentAllocationStableId');
    expect(allocation).toContain('expenseDocumentId');
    expect(allocation).toContain('accountId');
    expect(allocation).toContain('amountCents');
    expect(allocation).toContain('sortOrder');
    expect(allocation).toContain('onDelete: Cascade');
    expect(allocation).toContain('@@unique([expenseDocumentId, accountId])');
    expect(allocation).toContain('@@index([expenseDocumentId])');
    expect(allocation).toContain('@@index([accountId])');
  });

  it('exposes paymentAllocations instead of the old single-account Expense input', () => {
    const operations = readFileSync(OPERATIONS_SERVICE, 'utf8');
    const input = operations.match(
      /export type AccountingExpenseInput = \{([\s\S]*?)\n\};/,
    )?.[1];

    expect(input).toBeDefined();
    expect(input).toContain(
      'paymentAllocations?: AccountingExpensePaymentAllocationInput[]',
    );
    expect(input).not.toMatch(/\baccountStableId\?\s*:/);
    expect(operations).toContain(
      'accountStableId is no longer supported for expenses; use paymentAllocations',
    );
  });

  it('uses payment allocations, not Expense category splits, for account-balance outflow', () => {
    const service = readFileSync(ACCOUNTING_SERVICE, 'utf8');

    expect(service).toContain(
      'this.prisma.accountingExpensePaymentAllocation.findMany',
    );
    expect(service).toContain(
      'row.type === AccountingTxType.EXPENSE && row.documentId',
    );
    expect(service).toContain('allocation.amountCents');
  });
});
