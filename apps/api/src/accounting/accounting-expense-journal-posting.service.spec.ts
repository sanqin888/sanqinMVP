import { AccountingDocumentStatus } from './accounting-contracts';
import { AccountingExpenseJournalPostingService } from './accounting-expense-journal-posting.service';
import { AccountingJournalService } from './accounting-journal.service';

const expenseRow = (overrides: Record<string, unknown> = {}) => ({
  documentStableId: 'expense_1',
  status: AccountingDocumentStatus.CONFIRMED,
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
    },
  ],
  paymentAllocations: [
    {
      paymentAllocationStableId: 'expensepay_1',
      amountCents: 8469,
      account: { accountStableId: 'account_primary_bank' },
    },
  ],
  transactions: [
    {
      amountCents: 7495,
      taxCents: 974,
      category: { categoryStableId: 'expense_telecom' },
    },
  ],
  ...overrides,
});

const makeService = (document = expenseRow()) => {
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
    expect(
      journal.createCanonicalExpenseJournalEntryInTx,
    ).toHaveBeenCalledWith(
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

  it('fails closed before Journal posting when owner splits diverge from the legacy copy', async () => {
    const { service, tx, journal } = makeService(
      expenseRow({
        transactions: [
          {
            amountCents: 7000,
            taxCents: 910,
            category: { categoryStableId: 'expense_telecom' },
          },
        ],
      }),
    );

    await expect(
      service.postConfirmedExpenseIfReadyInTx(
        tx as never,
        'expense_1',
        'user_stable_1',
      ),
    ).rejects.toThrow('SPLIT_PERSISTENCE_MISMATCH');
    expect(
      journal.createCanonicalExpenseJournalEntryInTx,
    ).not.toHaveBeenCalled();
  });
});
