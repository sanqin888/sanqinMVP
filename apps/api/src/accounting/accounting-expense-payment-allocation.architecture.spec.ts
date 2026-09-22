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
const EXPENSE_CONTRACT = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense.contracts.ts',
);
const EXPENSE_SERVICE = resolve(
  ACCOUNTING_ROOT,
  'accounting-expense.service.ts',
);
const ACCOUNTING_SERVICE = resolve(ACCOUNTING_ROOT, 'accounting.service.ts');
const FINANCIAL_REPORTS_SERVICE = resolve(
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

  it('retains v1 allocation history while current Expense writes use split-level funding', () => {
    const expenseContract = readFileSync(EXPENSE_CONTRACT, 'utf8');
    const expenseService = readFileSync(EXPENSE_SERVICE, 'utf8');
    const input = expenseContract.match(
      /export type AccountingExpenseInput = \{([\s\S]*?)\n\};/,
    )?.[1];

    expect(input).toBeDefined();
    expect(input).not.toContain('paymentAllocations');
    expect(input).not.toMatch(/\baccountStableId\?\s*:/);
    expect(expenseContract).toContain(
      'paidFromAccountStableId: string | null',
    );
    expect(expenseContract).toContain(
      'AccountingExpensePaymentCompletionInput',
    );
    expect(expenseService).toContain(
      'document-level paymentAllocations are not supported for Expense v2',
    );
    expect(expenseService).toContain(
      'legacy payment allocation completion only supports Expense v1',
    );
  });

  it('keeps payment allocations as Expense posting facts but removes them from report arithmetic', () => {
    const broadService = readFileSync(ACCOUNTING_SERVICE, 'utf8');
    const reportsService = readFileSync(FINANCIAL_REPORTS_SERVICE, 'utf8');

    expect(reportsService).toContain('async accountBalanceReport(');
    expect(reportsService).not.toContain(
      'this.prisma.accountingExpensePaymentAllocation.findMany',
    );
    expect(broadService).not.toContain(
      'this.prisma.accountingExpensePaymentAllocation.findMany',
    );
    expect(broadService).not.toContain('async accountBalanceReport(');
  });
});
