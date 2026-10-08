import {
  applyAccountingExpenseCorrectionTargetInput,
  hashAccountingExpenseCorrectionTarget,
  normalizeAccountingExpenseCorrectionTarget,
  toAccountingExpenseCorrectionDraftInput,
  AccountingExpenseCorrectionTargetPolicyError,
  type AccountingExpenseCorrectionTargetV1,
} from './accounting-expense-correction-target.policy';

const sha = (seed: string) => seed.repeat(64).slice(0, 64);

const v2Target = (
  overrides: Partial<AccountingExpenseCorrectionTargetV1> = {},
): AccountingExpenseCorrectionTargetV1 => ({
  version: 1,
  document: {
    documentStableId: 'expense_v2',
    fundingAttributionVersion: 2,
    occurredAt: '2026-09-22T04:00:00.000Z',
    currency: 'CAD',
    subtotalCents: 8000,
    taxCents: 1040,
    totalCents: 9040,
    memo: 'Kitchen receipt',
    sourcePostingAuthorityHash: sha('a'),
  },
  basedOnAuthorityHash: sha('a'),
  splits: [
    {
      splitStableId: 'split_meat',
      categoryStableId: 'expense_meat',
      amountCents: 6000,
      taxCents: 780,
      paidFromAccountStableId: 'account_cibc',
    },
    {
      splitStableId: 'split_supplies',
      categoryStableId: 'expense_kitchen_supplies',
      amountCents: 2000,
      taxCents: 260,
      paidFromAccountStableId: 'account_primary_bank',
    },
  ],
  paymentAllocations: [],
  ...overrides,
});

const v1Target = (): AccountingExpenseCorrectionTargetV1 => ({
  version: 1,
  document: {
    documentStableId: 'expense_v1',
    fundingAttributionVersion: 1,
    occurredAt: '2026-07-01T04:00:00.000Z',
    currency: 'CAD',
    subtotalCents: 7495,
    taxCents: 974,
    totalCents: 8469,
    memo: 'Bell',
    sourcePostingAuthorityHash: sha('b'),
  },
  basedOnAuthorityHash: sha('b'),
  splits: [
    {
      splitStableId: 'split_telecom',
      categoryStableId: 'expense_telecom',
      amountCents: 7495,
      taxCents: 974,
      paidFromAccountStableId: null,
    },
  ],
  paymentAllocations: [
    {
      paymentAllocationStableId: 'allocation_bank',
      accountStableId: 'account_primary_bank',
      amountCents: 8469,
    },
  ],
});

describe('Accounting Expense correction target policy', () => {
  it('inherits unchanged v2 split funding while allowing amount/category correction', () => {
    const base = normalizeAccountingExpenseCorrectionTarget(v2Target());
    const next = applyAccountingExpenseCorrectionTargetInput({
      base,
      input: {
        version: 1,
        expectedBaseAuthorityHash: hashAccountingExpenseCorrectionTarget(base),
        totalCents: 10170,
        memo: 'Corrected receipt',
        splits: [
          {
            splitStableId: 'split_meat',
            categoryStableId: 'expense_meat',
            amountCents: 7000,
            taxCents: 910,
          },
          {
            splitStableId: 'split_supplies',
            categoryStableId: 'expense_cleaning',
            amountCents: 2000,
            taxCents: 260,
          },
        ],
      },
    });

    expect(next.document.totalCents).toBe(10170);
    expect(next.document.subtotalCents).toBe(9000);
    expect(next.document.taxCents).toBe(1170);
    expect(
      next.splits.find((split) => split.splitStableId === 'split_meat')
        ?.paidFromAccountStableId,
    ).toBe('account_cibc');
    expect(
      next.splits.find((split) => split.splitStableId === 'split_supplies')
        ?.paidFromAccountStableId,
    ).toBe('account_primary_bank');
  });

  it('allows explicit v2 funding removal in DRAFT and leaves a new split unfunded when omitted', () => {
    const base = normalizeAccountingExpenseCorrectionTarget(v2Target());
    const next = applyAccountingExpenseCorrectionTargetInput({
      base,
      input: {
        version: 1,
        expectedBaseAuthorityHash: hashAccountingExpenseCorrectionTarget(base),
        totalCents: 9040,
        splits: [
          {
            splitStableId: 'split_meat',
            categoryStableId: 'expense_meat',
            amountCents: 6000,
            taxCents: 780,
            paidFromAccountStableId: null,
          },
          {
            splitStableId: 'split_new',
            categoryStableId: 'expense_kitchen_supplies',
            amountCents: 2000,
            taxCents: 260,
          },
        ],
      },
    });

    expect(next.splits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          splitStableId: 'split_meat',
          paidFromAccountStableId: null,
        }),
        expect.objectContaining({
          splitStableId: 'split_new',
          paidFromAccountStableId: null,
        }),
      ]),
    );
  });

  it('lets v1 clear payment allocations so a business correction can remain DRAFT while funding is unresolved', () => {
    const base = normalizeAccountingExpenseCorrectionTarget(v1Target());
    const next = applyAccountingExpenseCorrectionTargetInput({
      base,
      input: {
        version: 1,
        expectedBaseAuthorityHash: hashAccountingExpenseCorrectionTarget(base),
        totalCents: 9000,
        splits: [
          {
            splitStableId: 'split_telecom',
            categoryStableId: 'expense_telecom',
            amountCents: 8000,
            taxCents: 1000,
          },
        ],
        paymentAllocations: [],
      },
    });

    expect(next.document.totalCents).toBe(9000);
    expect(next.paymentAllocations).toEqual([]);
  });

  it('rejects stale-editor authority hashes', () => {
    expect(() =>
      applyAccountingExpenseCorrectionTargetInput({
        base: v2Target(),
        input: {
          version: 1,
          expectedBaseAuthorityHash: sha('f'),
          totalCents: 9040,
          splits: v2Target().splits,
        },
      }),
    ).toThrow(AccountingExpenseCorrectionTargetPolicyError);
  });

  it('requires split totals to reconcile to the corrected document total', () => {
    const base = normalizeAccountingExpenseCorrectionTarget(v2Target());
    expect(() =>
      applyAccountingExpenseCorrectionTargetInput({
        base,
        input: {
          version: 1,
          expectedBaseAuthorityHash:
            hashAccountingExpenseCorrectionTarget(base),
          totalCents: 9041,
          splits: base.splits,
        },
      }),
    ).toThrow('Expense correction splits do not match totalCents');
  });

  it('keeps historical v1 funding separate from v2 split funding', () => {
    expect(() =>
      normalizeAccountingExpenseCorrectionTarget({
        ...v1Target(),
        splits: [
          {
            ...v1Target().splits[0],
            paidFromAccountStableId: 'account_primary_bank',
          },
        ],
      }),
    ).toThrow('Expense v1 correction target cannot use split-level funding');

    expect(() =>
      normalizeAccountingExpenseCorrectionTarget({
        ...v2Target(),
        paymentAllocations: v1Target().paymentAllocations,
      }),
    ).toThrow(
      'Expense v2 correction target cannot use document-level payment allocations',
    );
  });

  it('hashes effective authority independently of lineage and emits an editor payload bound to the current hash', () => {
    const target = normalizeAccountingExpenseCorrectionTarget(v2Target());
    const sameAuthorityDifferentLineage =
      normalizeAccountingExpenseCorrectionTarget({
        ...v2Target(),
        basedOnAuthorityHash: sha('c'),
      });

    expect(hashAccountingExpenseCorrectionTarget(target)).toBe(
      hashAccountingExpenseCorrectionTarget(sameAuthorityDifferentLineage),
    );
    expect(toAccountingExpenseCorrectionDraftInput(target)).toEqual(
      expect.objectContaining({
        version: 1,
        expectedBaseAuthorityHash:
          hashAccountingExpenseCorrectionTarget(target),
        totalCents: 9040,
      }),
    );
  });
});
