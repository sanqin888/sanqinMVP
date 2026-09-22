import {
  buildCanonicalExpenseJournal,
  buildCanonicalExpenseJournalsV2,
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

const factV2 = (overrides: Record<string, unknown> = {}) => ({
  version: 2 as const,
  documentStableId: 'expense_v2',
  occurredAt: '2026-09-22T04:00:00.000Z',
  currency: 'CAD',
  subtotalCents: 9495,
  taxCents: 1234,
  totalCents: 10729,
  memo: 'Mixed funding receipt',
  splits: [
    {
      splitStableId: 'expensesplit_meat',
      categoryStableId: 'expense_meat',
      paidFromAccountStableId: 'account_cibc',
      amountCents: 6000,
      taxCents: 780,
    },
    {
      splitStableId: 'expensesplit_supplies',
      categoryStableId: 'expense_kitchen_supplies',
      paidFromAccountStableId: 'account_cibc',
      amountCents: 2000,
      taxCents: 260,
    },
    {
      splitStableId: 'expensesplit_telecom',
      categoryStableId: 'expense_telecom',
      paidFromAccountStableId: 'account_primary_bank',
      amountCents: 1495,
      taxCents: 194,
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

  it('groups Expense v2 splits into one balanced Journal per funding account', () => {
    const journals = buildCanonicalExpenseJournalsV2(factV2());

    expect(journals).toHaveLength(2);
    expect(journals[0]).toEqual(
      expect.objectContaining({
        idempotencyKey: 'canonical-expense:expense_v2:funding:account_cibc:v2',
        sourceFactType: 'accounting.expense_document.v2',
        sourceFactStableId: 'expense_v2',
        sourceFactVersion: 2,
        lines: [
          {
            accountStableId: 'account_general_operating_expense',
            categoryStableId: 'expense_meat',
            debitCents: 6000,
            creditCents: 0,
            memo: 'Expense expense_v2',
          },
          {
            accountStableId: 'account_general_operating_expense',
            categoryStableId: 'expense_kitchen_supplies',
            debitCents: 2000,
            creditCents: 0,
            memo: 'Expense expense_v2',
          },
          {
            accountStableId: 'account_hst_recoverable',
            debitCents: 1040,
            creditCents: 0,
            memo: 'Recoverable HST/GST for expense_v2',
          },
          {
            accountStableId: 'account_cibc',
            debitCents: 0,
            creditCents: 9040,
            memo: 'Expense payment for expense_v2',
          },
        ],
      }),
    );
    expect(journals[1]).toEqual(
      expect.objectContaining({
        idempotencyKey:
          'canonical-expense:expense_v2:funding:account_primary_bank:v2',
        sourceFactType: 'accounting.expense_document.v2',
        sourceFactVersion: 2,
      }),
    );
    expect(journals[1]?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountStableId: 'account_primary_bank',
          creditCents: 1689,
        }),
      ]),
    );
  });

  it('fails closed when an Expense v2 split has zero total value', () => {
    expectPolicyErrorCode(
      () =>
        buildCanonicalExpenseJournalsV2(
          factV2({
            splits: [
              {
                splitStableId: 'expensesplit_zero',
                categoryStableId: 'expense_meat',
                paidFromAccountStableId: 'account_cibc',
                amountCents: 0,
                taxCents: 0,
              },
              {
                splitStableId: 'expensesplit_rest',
                categoryStableId: 'expense_kitchen_supplies',
                paidFromAccountStableId: 'account_primary_bank',
                amountCents: 9495,
                taxCents: 1234,
              },
            ],
          }),
        ),
      'INVALID_AMOUNT',
    );
  });

  it('fails closed when an Expense v2 split has no funding account', () => {
    expectPolicyErrorCode(
      () =>
        buildCanonicalExpenseJournalsV2(
          factV2({
            splits: [
              {
                splitStableId: 'expensesplit_missing_funding',
                categoryStableId: 'expense_meat',
                paidFromAccountStableId: '',
                amountCents: 9495,
                taxCents: 1234,
              },
            ],
          }),
        ),
      'MISSING_FUNDING_ACCOUNT',
    );
  });
});
