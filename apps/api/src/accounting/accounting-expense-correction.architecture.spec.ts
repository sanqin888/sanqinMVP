import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const adapterSource = readFileSync(
  resolve(__dirname, 'accounting-expense-correction.adapter.ts'),
  'utf8',
);
const targetPolicySource = readFileSync(
  resolve(__dirname, 'accounting-expense-correction-target.policy.ts'),
  'utf8',
);
const expenseControllerSource = readFileSync(
  resolve(__dirname, 'accounting-expense.controller.ts'),
  'utf8',
);
const moduleSource = readFileSync(
  resolve(__dirname, 'accounting.module.ts'),
  'utf8',
);

describe('Expense posted correction C1 architecture', () => {
  it('keeps the target policy pure and names a versioned Expense-owned authority schema', () => {
    expect(targetPolicySource).toContain(
      "'accounting.expense-correction-target.v1'",
    );
    expect(targetPolicySource).not.toContain('@nestjs/common');
    expect(targetPolicySource).not.toContain('@prisma/client');
    expect(targetPolicySource).toContain('fundingAttributionVersion');
    expect(targetPolicySource).toContain('paymentAllocations');
    expect(targetPolicySource).toContain('paidFromAccountStableId');
  });

  it('reuses canonical Expense pure posting policy without becoming a second canonical Expense writer', () => {
    expect(adapterSource).toContain('buildCanonicalExpenseJournal(');
    expect(adapterSource).toContain('buildCanonicalExpenseJournalsV2(');
    expect(adapterSource).toContain(
      'normalizeCanonicalExpenseJournalWriteAuthority',
    );
    expect(adapterSource).not.toContain(
      '.createCanonicalExpenseJournalEntryInTx(',
    );
  });

  it('never reopens or mutates the original confirmed Expense source rows', () => {
    for (const forbidden of [
      'accountingExpenseDocument.update(',
      'accountingExpenseDocument.updateMany(',
      'accountingExpenseSplit.update(',
      'accountingExpenseSplit.updateMany(',
      'accountingExpenseSplit.create(',
      'accountingExpenseSplit.createMany(',
      'accountingExpensePaymentAllocation.create(',
      'accountingExpensePaymentAllocation.update(',
      'accountingExpensePaymentAllocation.delete',
    ]) {
      expect(adapterSource).not.toContain(forbidden);
    }
  });

  it('supports both frozen historical v1 and current v2 ownership without a schema migration', () => {
    expect(adapterSource).toContain('CANONICAL_EXPENSE_SOURCE_FACT_TYPE');
    expect(adapterSource).toContain('CANONICAL_EXPENSE_SOURCE_FACT_TYPE_V2');
    expect(adapterSource).toContain('targetVersion must be 1 or 2');
    expect(adapterSource).toContain(
      'Expense v2 correction requires complete split funding before READY',
    );
  });

  it('exposes C2 through an Expense-specific facade without leaking the owner adapter or A3 lifecycle into transport', () => {
    expect(moduleSource).toContain('AccountingExpenseCorrectionAdapter');
    expect(moduleSource).toContain('AccountingExpenseCorrectionService');
    expect(expenseControllerSource).toContain(
      'AccountingExpenseCorrectionService',
    );
    expect(expenseControllerSource).not.toContain(
      'AccountingExpenseCorrectionAdapter',
    );
    expect(expenseControllerSource).not.toContain(
      'AccountingPostedFinancialCorrectionService',
    );
    expect(expenseControllerSource).toContain(
      "journal/expense/:documentStableId/correction",
    );
  });

  it('keeps normal C1 on DELTA and fails closed for duplicate-posting reversal semantics', () => {
    expect(adapterSource).toContain(
      'strategy: AccountingPostedCorrectionStrategy.DELTA',
    );
    expect(adapterSource).toContain(
      'does not support DUPLICATE_POSTING; use a future REVERSAL_ONLY flow',
    );
  });
});
