import {
  AccountingDocumentStatus,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import {
  buildCanonicalExpenseJournalWritePlan,
} from './accounting-expense-journal-write-authority';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';

const fact = () => ({
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
});

const persistedExpense = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

function makeService() {
  const plan = buildCanonicalExpenseJournalWritePlan({
    fact: fact(),
    splitStableIds: ['expensesplit_1'],
    paymentAllocationStableIds: ['expensepay_1'],
  });
  const tx = {
    accountingExpenseDocument: {
      findUnique: jest.fn().mockResolvedValue(persistedExpense()),
    },
    accountingAccount: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'account-expense-db-id',
          accountStableId: 'account_general_operating_expense',
          currency: 'CAD',
        },
        {
          id: 'account-tax-db-id',
          accountStableId: 'account_hst_recoverable',
          currency: 'CAD',
        },
        {
          id: 'account-bank-db-id',
          accountStableId: 'account_primary_bank',
          currency: 'CAD',
        },
      ]),
    },
    accountingCategory: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'category-telecom-db-id',
          categoryStableId: 'expense_telecom',
        },
      ]),
    },
    accountingJournalEntry: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        entryStableId: 'journal_expense_1',
        idempotencyKey: 'canonical-expense:expense_1:v1',
        kind: AccountingJournalEntryKind.STANDARD,
        source: AccountingJournalSource.EXPENSE_DOCUMENT,
        sourceFactType: 'accounting.expense_document.v1',
        sourceFactStableId: 'expense_1',
        sourceFactVersion: 1,
        storeStableId: null,
        occurredAt: new Date('2026-09-21T04:00:00.000Z'),
        currency: 'CAD',
        memo: 'Bell',
        createdByActorRef: 'user_stable_1',
        updatedByActorRef: 'user_stable_1',
        createdAt: new Date('2026-09-21T18:00:00.000Z'),
        updatedAt: new Date('2026-09-21T18:00:00.000Z'),
        version: 1,
        deletedAt: null,
        lines: [],
      }),
    },
    accountingAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const period = {
    getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    assertOnOrAfterAccountingStartDate: jest.fn().mockResolvedValue(undefined),
    assertJournalEditableForPeriod: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AccountingJournalService(
    {} as never,
    period as unknown as AccountingPeriodService,
  );
  return { service, tx, period, plan };
}

describe('AccountingJournalService canonical Expense authority', () => {
  it('rejects canonical Expense creation through the generic Journal writer', async () => {
    const { service, plan } = makeService();

    await expect(
      service.createJournalEntry(plan.journal, 'user_stable_1'),
    ).rejects.toThrow(
      'canonical Expense Journals require Expense-specific write authority',
    );
  });

  it('revalidates persisted Expense owner facts before creating the Journal', async () => {
    const { service, tx, period, plan } = makeService();

    await expect(
      service.createCanonicalExpenseJournalEntryInTx(
        plan.journal,
        'user_stable_1',
        plan.authority,
        tx as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({ entryStableId: 'journal_expense_1' }),
    );

    expect(tx.accountingExpenseDocument.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { documentStableId: 'expense_1' } }),
    );
    expect(period.assertJournalEditableForPeriod).toHaveBeenCalledWith(
      new Date('2026-09-21T04:00:00.000Z'),
      AccountingJournalEntryKind.STANDARD,
      tx,
      'America/Toronto',
    );
    expect(tx.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.accountingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CREATE',
          entityType: 'ACCOUNTING_JOURNAL_ENTRY',
          afterJson: expect.objectContaining({
            writeAuthority: expect.objectContaining({
              role: 'EXPENSE_DOCUMENT',
            }) as unknown,
          }) as unknown,
        }) as unknown,
      }),
    );
  });

  it('fails closed when persisted Expense split identity changes before write', async () => {
    const { service, tx, plan } = makeService();
    tx.accountingExpenseDocument.findUnique.mockResolvedValue(
      persistedExpense({
        splits: [
          {
            splitStableId: 'expensesplit_changed',
            amountCents: 7495,
            taxCents: 974,
            category: { categoryStableId: 'expense_telecom' },
          },
        ],
      }),
    );

    await expect(
      service.createCanonicalExpenseJournalEntryInTx(
        plan.journal,
        'user_stable_1',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'canonical Expense authority changed before Journal posting',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

});
