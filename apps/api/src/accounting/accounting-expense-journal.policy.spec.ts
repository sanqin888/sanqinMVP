import {
  buildCanonicalExpenseJournal,
  CanonicalExpenseJournalPolicyError,
} from './accounting-expense-journal.policy';

const fact = (overrides: Record<string, unknown> = {}) => ({
  version: 1 as const,
  documentStableId: 'expense_1',
  occurredAt: '2026-09-21T04:00:00.000Z',
  currency: 'CAD',
  subtotalCents: 7495,
  taxCents: 974,
  totalCents: 8469,
  memo: 'Bell',
  splits: [
    {
      categoryStableId: 'expense_telecom',
      amountCents: 7495,
      taxCents: 974,
    },
  ],
  paymentAllocations: [
    {
      accountStableId: 'account_primary_bank',
      amountCents: 8469,
    },
  ],
  ...overrides,
});

const expectPolicyErrorCode = (
  operation: () => unknown,
  code: CanonicalExpenseJournalPolicyError['code'],
) => {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(CanonicalExpenseJournalPolicyError);
    expect((error as CanonicalExpenseJournalPolicyError).code).toBe(code);
    return;
  }
  throw new Error(`expected policy error ${code}`);
};

describe('canonical Expense Journal policy', () => {
  it('maps expense subtotal, recoverable tax and reviewed payment account into a balanced Journal', () => {
    const journal = buildCanonicalExpenseJournal(fact());

    expect(journal).toEqual(
      expect.objectContaining({
        idempotencyKey: 'canonical-expense:expense_1:v1',
        sourceFactType: 'accounting.expense_document.v1',
        sourceFactStableId: 'expense_1',
        sourceFactVersion: 1,
        currency: 'CAD',
        lines: [
          {
            accountStableId: 'account_general_operating_expense',
            categoryStableId: 'expense_telecom',
            debitCents: 7495,
            creditCents: 0,
            memo: 'Expense expense_1',
          },
          {
            accountStableId: 'account_hst_recoverable',
            debitCents: 974,
            creditCents: 0,
            memo: 'Recoverable HST/GST for expense_1',
          },
          {
            accountStableId: 'account_primary_bank',
            debitCents: 0,
            creditCents: 8469,
            memo: 'Expense payment for expense_1',
          },
        ],
      }),
    );
  });

  it('fails closed instead of guessing a payment account', () => {
    expectPolicyErrorCode(
      () => buildCanonicalExpenseJournal(fact({ paymentAllocations: [] })),
      'MISSING_PAYMENT_ALLOCATION',
    );
  });

  it('blocks split/document mismatches', () => {
    expectPolicyErrorCode(
      () =>
        buildCanonicalExpenseJournal(
          fact({
            splits: [
              {
                categoryStableId: 'expense_telecom',
                amountCents: 7000,
                taxCents: 974,
              },
            ],
          }),
        ),
      'SPLIT_AMOUNT_MISMATCH',
    );
  });
});
