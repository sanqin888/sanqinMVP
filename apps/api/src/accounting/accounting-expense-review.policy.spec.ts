import {
  AccountingExpenseReviewPolicyError,
  normalizeAccountingExpenseReviewDraft,
  normalizeAccountingExpenseReviewEffective,
  parseStoredAccountingExpenseReviewEffective,
} from './accounting-expense-review.policy';

describe('accounting expense review policy', () => {
  const effective = {
    occurredAt: '2026-06-28',
    totalCents: 8469,
    sourceCurrency: 'cad',
    paymentAllocations: [
      { accountStableId: 'account_primary_bank', amountCents: 8469 },
    ],
    memo: ' Bell June bill ',
    splits: [
      {
        categoryStableId: 'expense_telecom',
        amountCents: 7495,
        taxCents: 974,
      },
    ],
  };

  it('normalizes a balanced human-reviewed expense snapshot', () => {
    expect(normalizeAccountingExpenseReviewEffective(effective)).toEqual({
      version: 1,
      occurredAt: '2026-06-28',
      totalCents: 8469,
      sourceCurrency: 'CAD',
      paymentAllocations: [
        { accountStableId: 'account_primary_bank', amountCents: 8469 },
      ],
      memo: 'Bell June bill',
      splits: [
        {
          categoryStableId: 'expense_telecom',
          amountCents: 7495,
          taxCents: 974,
        },
      ],
    });
  });

  it('rejects a human-reviewed expense when subtotal plus tax does not equal total', () => {
    expect(() =>
      normalizeAccountingExpenseReviewEffective({
        ...effective,
        splits: [
          {
            categoryStableId: 'expense_telecom',
            amountCents: 7495,
            taxCents: 18500,
          },
        ],
      }),
    ).toThrow(AccountingExpenseReviewPolicyError);
  });

  it('rejects payment allocations that do not equal the reviewed total', () => {
    expect(() =>
      normalizeAccountingExpenseReviewEffective({
        ...effective,
        paymentAllocations: [
          { accountStableId: 'account_primary_bank', amountCents: 8400 },
        ],
      }),
    ).toThrow('effective.paymentAllocations do not match totalCents');
  });

  it('requires the inbox version and preserves the normalized effective snapshot', () => {
    const normalized = normalizeAccountingExpenseReviewDraft({
      expectedInboxVersion: 7,
      note: ' Tax Summary confirms HST $9.74 ',
      effective,
    });

    expect(normalized).toEqual({
      expectedInboxVersion: 7,
      note: 'Tax Summary confirms HST $9.74',
      effective: expect.objectContaining({
        version: 1,
        sourceCurrency: 'CAD',
        totalCents: 8469,
      }) as unknown,
    });
  });

  it('revalidates a stored review payload instead of trusting arbitrary JSON', () => {
    expect(
      parseStoredAccountingExpenseReviewEffective({
        version: 1,
        occurredAt: '2026-06-28',
        totalCents: 8469,
        sourceCurrency: 'CAD',
        paymentAllocations: [],
        memo: null,
        splits: [
          {
            categoryStableId: 'expense_telecom',
            amountCents: 7495,
            taxCents: 974,
          },
        ],
      }),
    ).toEqual(
      expect.objectContaining({
        occurredAt: '2026-06-28',
        totalCents: 8469,
      }),
    );

    expect(() =>
      parseStoredAccountingExpenseReviewEffective({
        version: 1,
        occurredAt: '2026-06-28',
        totalCents: 8469,
        sourceCurrency: 'CAD',
        paymentAllocations: [],
        memo: null,
        splits: [
          {
            categoryStableId: 'expense_telecom',
            amountCents: 7495,
            taxCents: 18500,
          },
        ],
      }),
    ).toThrow(AccountingExpenseReviewPolicyError);
  });
});
