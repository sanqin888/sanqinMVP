import { AccountingDocumentStatus } from './accounting-contracts';
import { AccountingExpenseJournalPostingService } from './accounting-expense-journal-posting.service';
import { AccountingJournalService } from './accounting-journal.service';

const expenseRow = (overrides: Record<string, unknown> = {}) => ({
  documentStableId: 'expense_1',
  status: AccountingDocumentStatus.CONFIRMED,
  fundingAttributionVersion: 1,
  occurredAt: new Date('2026-09-21T04:00:00.000Z'),
  subtotalCents: 7495,
  taxCents: 974,
  totalCents: 8469,
  currency: 'CAD',
  memo: 'Bell',
  splits: [
    {
      splitStableId: 'expensesplit_1',
      amountCents: 7495,
      taxCents: 974,
      category: { categoryStableId: 'expense_telecom' },
      paidFromAccount: null,
    },
  ],
  paymentAllocations: [
    {
      paymentAllocationStableId: 'expensepay_1',
      amountCents: 8469,
      account: { accountStableId: 'account_primary_bank' },
    },
  ],
  ...overrides,
});

const expenseRowV2 = (overrides: Record<string, unknown> = {}) => ({
  documentStableId: 'expense_v2',
  status: AccountingDocumentStatus.CONFIRMED,
  fundingAttributionVersion: 2,
  occurredAt: new Date('2026-09-22T04:00:00.000Z'),
  subtotalCents: 7500,
  taxCents: 975,
  totalCents: 8475,
  currency: 'CAD',
  memo: 'Mixed funding',
  splits: [
    {
      splitStableId: 'expensesplit_cibc',
      amountCents: 5000,
      taxCents: 650,
      category: { categoryStableId: 'expense_meat' },
      paidFromAccount: {
        accountStableId: 'account_cibc',
        accountClass: 'ASSET',
        type: 'BANK',
        currency: 'CAD',
        isActive: true,
      },
    },
    {
      splitStableId: 'expensesplit_primary',
      amountCents: 2500,
      taxCents: 325,
      category: { categoryStableId: 'expense_kitchen_supplies' },
      paidFromAccount: {
        accountStableId: 'account_primary_bank',
        accountClass: 'ASSET',
        type: 'BANK',
        currency: 'CAD',
        isActive: true,
      },
    },
  ],
  paymentAllocations: [],
  ...overrides,
});

const makeService = (document: Record<string, unknown> = expenseRow()) => {
  const tx = {
    accountingExpenseDocument: {
      findUnique: jest.fn().mockResolvedValue(document),
    },
  };
  const journal = {
    createCanonicalExpenseJournalEntryInTx: jest
      .fn()
      .mockResolvedValue({ entryStableId: 'journal_expense_1' }),
  };
  return {
    service: new AccountingExpenseJournalPostingService(
      journal as unknown as AccountingJournalService,
    ),
    tx,
    journal,
  };
};

describe('AccountingExpenseJournalPostingService', () => {
  it('builds posting authority only from persisted Expense facts', async () => {
    const { service, tx, journal } = makeService();

    await expect(
      service.postConfirmedExpenseIfReadyInTx(
        tx as never,
        'expense_1',
        'user_stable_1',
      ),
    ).resolves.toEqual({ entryStableId: 'journal_expense_1' });

    expect(tx.accountingExpenseDocument.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { documentStableId: 'expense_1' } }),
    );
    expect(journal.createCanonicalExpenseJournalEntryInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'canonical-expense:expense_1:v1',
        source: 'EXPENSE_DOCUMENT',
        sourceFactType: 'accounting.expense_document.v1',
        sourceFactStableId: 'expense_1',
      }),
      'user_stable_1',
      expect.objectContaining({
        version: 1,
        role: 'EXPENSE_DOCUMENT',
        splitStableIds: ['expensesplit_1'],
        paymentAllocationStableIds: ['expensepay_1'],
        fact: expect.objectContaining({
          documentStableId: 'expense_1',
          subtotalCents: 7495,
          taxCents: 974,
          totalCents: 8469,
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
        }) as unknown,
      }),
      tx,
    );
  });

  it('treats null funding version as historical v1 during the expand stage', async () => {
    const { service, tx, journal } = makeService(
      expenseRow({ fundingAttributionVersion: null }),
    );

    await expect(
      service.postConfirmedExpenseIfReadyInTx(
        tx as never,
        'expense_1',
        'user_stable_1',
      ),
    ).resolves.toEqual({ entryStableId: 'journal_expense_1' });
    expect(journal.createCanonicalExpenseJournalEntryInTx).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'canonical-expense:expense_1:v1',
      }),
      'user_stable_1',
      expect.objectContaining({ version: 1 }),
      tx,
    );
  });

  it('keeps a confirmed Expense unposted when payment allocation is unknown', async () => {
    const { service, tx, journal } = makeService(
      expenseRow({ paymentAllocations: [] }),
    );

    await expect(
      service.postConfirmedExpenseIfReadyInTx(
        tx as never,
        'expense_1',
        'user_stable_1',
      ),
    ).resolves.toBeNull();
    expect(
      journal.createCanonicalExpenseJournalEntryInTx,
    ).not.toHaveBeenCalled();
  });

  it('posts one Expense v2 Journal per reviewed funding account in the caller transaction', async () => {
    const { service, tx, journal } = makeService(expenseRowV2());
    journal.createCanonicalExpenseJournalEntryInTx
      .mockResolvedValueOnce({ entryStableId: 'journal_cibc' })
      .mockResolvedValueOnce({ entryStableId: 'journal_primary' });

    await expect(
      service.postConfirmedExpenseIfReadyInTx(
        tx as never,
        'expense_v2',
        'user_stable_1',
      ),
    ).resolves.toEqual([
      { entryStableId: 'journal_cibc' },
      { entryStableId: 'journal_primary' },
    ]);

    expect(
      journal.createCanonicalExpenseJournalEntryInTx,
    ).toHaveBeenCalledTimes(2);
    expect(
      journal.createCanonicalExpenseJournalEntryInTx,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        idempotencyKey: 'canonical-expense:expense_v2:funding:account_cibc:v2',
        sourceFactType: 'accounting.expense_document.v2',
        sourceFactStableId: 'expense_v2',
        sourceFactVersion: 2,
      }),
      'user_stable_1',
      expect.objectContaining({
        version: 2,
        fundingAccountStableId: 'account_cibc',
      }),
      tx,
    );
    expect(
      journal.createCanonicalExpenseJournalEntryInTx,
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        idempotencyKey:
          'canonical-expense:expense_v2:funding:account_primary_bank:v2',
      }),
      'user_stable_1',
      expect.objectContaining({
        version: 2,
        fundingAccountStableId: 'account_primary_bank',
      }),
      tx,
    );
  });

  it('keeps Expense v2 unposted until every split has reviewed funding', async () => {
    const row = expenseRowV2();
    const incomplete = {
      ...row,
      splits: [
        row.splits[0],
        {
          ...row.splits[1],
          paidFromAccount: null,
        },
      ],
    };
    const { service, tx, journal } = makeService(incomplete);

    await expect(
      service.postConfirmedExpenseIfReadyInTx(
        tx as never,
        'expense_v2',
        'user_stable_1',
      ),
    ).resolves.toBeNull();
    expect(
      journal.createCanonicalExpenseJournalEntryInTx,
    ).not.toHaveBeenCalled();
  });

  it('fails closed when Expense v2 retains legacy document payment allocations', async () => {
    const { service, tx } = makeService(
      expenseRowV2({
        paymentAllocations: [
          {
            paymentAllocationStableId: 'legacy_allocation',
            amountCents: 8475,
            account: { accountStableId: 'account_primary_bank' },
          },
        ],
      }),
    );

    await expect(
      service.postConfirmedExpenseIfReadyInTx(
        tx as never,
        'expense_v2',
        'user_stable_1',
      ),
    ).rejects.toThrow(
      'Expense v2 cannot retain legacy document-level payment allocations',
    );
  });

  it('rejects a non-operational Expense v2 funding account', async () => {
    const row = expenseRowV2();
    const invalid = {
      ...row,
      splits: [
        {
          ...row.splits[0],
          paidFromAccount: {
            ...row.splits[0].paidFromAccount,
            accountClass: 'REVENUE',
          },
        },
        row.splits[1],
      ],
    };
    const { service, tx } = makeService(invalid);

    await expect(
      service.postConfirmedExpenseIfReadyInTx(
        tx as never,
        'expense_v2',
        'user_stable_1',
      ),
    ).rejects.toThrow(
      'Expense funding account is not an active CAD operational ASSET account',
    );
  });
});
