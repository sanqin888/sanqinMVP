import { AccountingDocumentStatus } from './accounting-contracts';
import { AccountingExpenseService } from './accounting-expense.service';

describe('Accounting Expense payment completion', () => {
  const period = {
    assertEditableForPeriod: jest.fn().mockResolvedValue(undefined),
  };
  const expenseJournalPosting = {
    postConfirmedExpenseIfReadyInTx: jest.fn().mockResolvedValue(null),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('atomically completes an unknown payment account and records audit evidence', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditCreate = jest.fn().mockResolvedValue({});
    const tx = {
      accountingExpenseDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'expense-db-id',
          status: AccountingDocumentStatus.CONFIRMED,
          occurredAt: new Date('2026-06-27T04:00:00.000Z'),
          totalCents: 8469,
          paymentAllocations: [],
        }),
        update: jest.fn().mockResolvedValue({ id: 'expense-db-id' }),
      },
      accountingJournalEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cibc-db-id',
            accountStableId: 'account_cibc',
            currency: 'CAD',
            isActive: true,
          },
        ]),
      },
      accountingExpensePaymentAllocation: { createMany },
      accountingAuditLog: { create: auditCreate },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new AccountingExpenseService(
      prisma as never,
      period as never,
      expenseJournalPosting as never,
    );
    jest
      .spyOn(service, 'getExpenseDocument')
      .mockResolvedValue({ documentStableId: 'expense_1' } as never);

    const result = await service.completeExpensePaymentAllocations(
      'expense_1',
      {
        paymentAllocations: [
          { accountStableId: 'account_cibc', amountCents: 8469 },
        ],
      },
      'user_stable_1',
    );

    expect(period.assertEditableForPeriod).toHaveBeenCalledWith(
      new Date('2026-06-27T04:00:00.000Z'),
      'EXPENSE',
      tx,
    );
    expect(tx.accountingExpenseDocument.update).toHaveBeenCalledWith({
      where: { id: 'expense-db-id' },
      data: { updatedAt: expect.any(Date) as unknown },
      select: { id: true },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          expenseDocumentId: 'expense-db-id',
          accountId: 'cibc-db-id',
          amountCents: 8469,
          sortOrder: 0,
        }) as unknown,
      ],
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'COMPLETE_EXPENSE_PAYMENT_ALLOCATIONS',
        entityType: 'ACCOUNTING_EXPENSE_DOCUMENT',
        entityId: 'expense_1',
        operatorActorRef: 'user_stable_1',
        beforeJson: { paymentAllocations: [] },
        afterJson: {
          paymentAllocations: [
            { accountStableId: 'account_cibc', amountCents: 8469 },
          ],
        },
      }) as unknown,
    });
    expect(
      expenseJournalPosting.postConfirmedExpenseIfReadyInTx,
    ).toHaveBeenCalledWith(tx, 'expense_1', 'user_stable_1');
    expect(result).toEqual({ documentStableId: 'expense_1' });
  });

  it('treats an identical retry as idempotent after completion', async () => {
    const tx = {
      accountingExpenseDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'expense-db-id',
          status: AccountingDocumentStatus.CONFIRMED,
          occurredAt: new Date('2026-06-27T04:00:00.000Z'),
          totalCents: 8469,
          paymentAllocations: [
            {
              amountCents: 8469,
              account: { accountStableId: 'account_cibc' },
            },
          ],
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new AccountingExpenseService(
      prisma as never,
      period as never,
      expenseJournalPosting as never,
    );
    jest
      .spyOn(service, 'getExpenseDocument')
      .mockResolvedValue({ documentStableId: 'expense_1' } as never);

    await expect(
      service.completeExpensePaymentAllocations(
        'expense_1',
        {
          paymentAllocations: [
            { accountStableId: 'account_cibc', amountCents: 8469 },
          ],
        },
        'user_stable_1',
      ),
    ).resolves.toEqual({ documentStableId: 'expense_1' });
    expect(period.assertEditableForPeriod).not.toHaveBeenCalled();
    expect(
      expenseJournalPosting.postConfirmedExpenseIfReadyInTx,
    ).toHaveBeenCalledWith(tx, 'expense_1', 'user_stable_1');
  });

  it('rejects replacement of an already completed payment fact', async () => {
    const tx = {
      accountingExpenseDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'expense-db-id',
          status: AccountingDocumentStatus.CONFIRMED,
          occurredAt: new Date('2026-06-27T04:00:00.000Z'),
          totalCents: 8469,
          paymentAllocations: [
            {
              amountCents: 8469,
              account: { accountStableId: 'account_cibc' },
            },
          ],
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new AccountingExpenseService(
      prisma as never,
      period as never,
      expenseJournalPosting as never,
    );

    await expect(
      service.completeExpensePaymentAllocations(
        'expense_1',
        {
          paymentAllocations: [
            { accountStableId: 'account_rbc', amountCents: 8469 },
          ],
        },
        'user_stable_1',
      ),
    ).rejects.toThrow('expense payment allocations are already completed');
  });

  it('rejects a completion that does not close to the booked total', async () => {
    const tx = {
      accountingExpenseDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'expense-db-id',
          status: AccountingDocumentStatus.CONFIRMED,
          occurredAt: new Date('2026-06-27T04:00:00.000Z'),
          totalCents: 8469,
          paymentAllocations: [],
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new AccountingExpenseService(
      prisma as never,
      period as never,
      expenseJournalPosting as never,
    );

    await expect(
      service.completeExpensePaymentAllocations(
        'expense_1',
        {
          paymentAllocations: [
            { accountStableId: 'account_cibc', amountCents: 8000 },
          ],
        },
        'user_stable_1',
      ),
    ).rejects.toThrow('payment allocations do not match CAD booking total');
    expect(period.assertEditableForPeriod).not.toHaveBeenCalled();
  });

  it('stops before the concurrency anchor when the Expense period is locked', async () => {
    const update = jest.fn();
    const tx = {
      accountingExpenseDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'expense-db-id',
          status: AccountingDocumentStatus.CONFIRMED,
          occurredAt: new Date('2026-06-27T04:00:00.000Z'),
          totalCents: 8469,
          paymentAllocations: [],
        }),
        update,
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    period.assertEditableForPeriod.mockRejectedValueOnce(
      new Error('period locked'),
    );
    const service = new AccountingExpenseService(
      prisma as never,
      period as never,
      expenseJournalPosting as never,
    );

    await expect(
      service.completeExpensePaymentAllocations(
        'expense_1',
        {
          paymentAllocations: [
            { accountStableId: 'account_cibc', amountCents: 8469 },
          ],
        },
        'user_stable_1',
      ),
    ).rejects.toThrow('period locked');
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses in-place completion when a canonical Expense Journal already exists', async () => {
    const tx = {
      accountingExpenseDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'expense-db-id',
          status: AccountingDocumentStatus.CONFIRMED,
          occurredAt: new Date('2026-06-27T04:00:00.000Z'),
          totalCents: 8469,
          paymentAllocations: [],
        }),
        update: jest.fn().mockResolvedValue({ id: 'expense-db-id' }),
      },
      accountingJournalEntry: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ entryStableId: 'journal_expense_1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new AccountingExpenseService(
      prisma as never,
      period as never,
      expenseJournalPosting as never,
    );

    await expect(
      service.completeExpensePaymentAllocations(
        'expense_1',
        {
          paymentAllocations: [
            { accountStableId: 'account_cibc', amountCents: 8469 },
          ],
        },
        'user_stable_1',
      ),
    ).rejects.toThrow(
      'posted expense payment facts cannot be completed in place',
    );
  });
});
