import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from '@prisma/client';
import { AccountingService } from './accounting.service';

const basePayload = {
  idempotencyKey: 'journal:manual:1',
  kind: AccountingJournalEntryKind.STANDARD,
  source: AccountingJournalSource.MANUAL,
  occurredAt: '2026-09-12T14:00:00.000Z',
  currency: 'CAD',
  memo: 'Kitchen supply purchase',
  lines: [
    {
      accountStableId: 'account_general_operating_expense',
      categoryStableId: 'expense_kitchen_supplies',
      debitCents: 1250,
      creditCents: 0,
    },
    {
      accountStableId: 'account_store_cash',
      debitCents: 0,
      creditCents: 1250,
    },
  ],
};

describe('AccountingService double-entry journal characterization', () => {
  const makeService = () => {
    const tx = {
      accountingAutomationConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      accountingPeriodClose: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      accountingJournalEntry: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      accountingJournalLine: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'account-expense-db-id',
            accountStableId: 'account_general_operating_expense',
            currency: 'CAD',
          },
          {
            id: 'account-cash-db-id',
            accountStableId: 'account_store_cash',
            currency: 'CAD',
          },
        ]),
      },
      accountingCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-db-id',
            categoryStableId: 'expense_kitchen_supplies',
          },
        ]),
      },
      accountingAuditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const transaction = jest.fn(
      (work: (transactionClient: typeof tx) => Promise<unknown>) => work(tx),
    );
    const prisma = { ...tx, $transaction: transaction };
    const brandStoreConfigReader = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
      }),
    };
    const service = new AccountingService(
      prisma as never,
      brandStoreConfigReader as never,
    );
    return { service, prisma };
  };

  const journalRow = (overrides: Record<string, unknown> = {}) => ({
    entryStableId: 'journal_stable_1',
    idempotencyKey: basePayload.idempotencyKey,
    kind: AccountingJournalEntryKind.STANDARD,
    source: AccountingJournalSource.MANUAL,
    sourceFactType: null,
    sourceFactStableId: null,
    sourceFactVersion: null,
    storeStableId: null,
    occurredAt: new Date(basePayload.occurredAt),
    currency: 'CAD',
    memo: basePayload.memo,
    createdByUserStableId: 'user_stable_1',
    updatedByUserStableId: 'user_stable_1',
    createdAt: new Date('2026-09-12T14:01:00.000Z'),
    updatedAt: new Date('2026-09-12T14:01:00.000Z'),
    version: 1,
    deletedAt: null,
    lines: [],
    ...overrides,
  });

  const internalJournalRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'journal-db-id',
    idempotencyHash: 'hash',
    ...journalRow(overrides),
  });

  it('creates a balanced journal with stable operator identity and CREATE audit evidence', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(null);
    prisma.accountingJournalEntry.create.mockResolvedValue(journalRow());

    const created = await service.createJournalEntry(
      basePayload,
      'user_stable_1',
    );

    expect(created.entryStableId).toBe('journal_stable_1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: basePayload.idempotencyKey,
          idempotencyHash: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
          kind: AccountingJournalEntryKind.STANDARD,
          source: AccountingJournalSource.MANUAL,
          createdByUserStableId: 'user_stable_1',
          updatedByUserStableId: 'user_stable_1',
          lines: {
            create: [
              expect.objectContaining({
                lineNo: 1,
                accountId: 'account-expense-db-id',
                categoryId: 'category-db-id',
                debitCents: 1250,
                creditCents: 0,
              }) as unknown,
              expect.objectContaining({
                lineNo: 2,
                accountId: 'account-cash-db-id',
                categoryId: null,
                debitCents: 0,
                creditCents: 1250,
              }) as unknown,
            ],
          },
        }) as unknown,
      }) as unknown,
    );
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        entityType: 'ACCOUNTING_JOURNAL_ENTRY',
        entityId: 'journal_stable_1',
        operatorUserId: 'user_stable_1',
      }) as unknown,
    });
  });

  it('rejects an inactive or missing account before journal persistence', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(null);
    prisma.accountingAccount.findMany.mockResolvedValue([
      {
        id: 'account-cash-db-id',
        accountStableId: 'account_store_cash',
        currency: 'CAD',
      },
    ]);

    await expect(
      service.createJournalEntry(basePayload, 'user_stable_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive or missing category before journal persistence', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(null);
    prisma.accountingCategory.findMany.mockResolvedValue([]);

    await expect(
      service.createJournalEntry(basePayload, 'user_stable_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('rejects an account whose currency does not match the journal currency', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(null);
    prisma.accountingAccount.findMany.mockResolvedValue([
      {
        id: 'account-expense-db-id',
        accountStableId: 'account_general_operating_expense',
        currency: 'USD',
      },
      {
        id: 'account-cash-db-id',
        accountStableId: 'account_store_cash',
        currency: 'CAD',
      },
    ]);

    await expect(
      service.createJournalEntry(basePayload, 'user_stable_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('returns equivalent public data for an identical idempotent replay without duplicate write/audit', async () => {
    const { service, prisma } = makeService();
    let stored: ReturnType<typeof internalJournalRow> | null = null;
    prisma.accountingJournalEntry.findUnique.mockImplementation(() =>
      Promise.resolve(stored),
    );
    prisma.accountingJournalEntry.create.mockImplementation(
      ({ data }: { data: { idempotencyHash: string } }) => {
        stored = internalJournalRow({ idempotencyHash: data.idempotencyHash });
        return Promise.resolve(journalRow());
      },
    );

    const first = await service.createJournalEntry(
      basePayload,
      'user_stable_1',
    );
    const second = await service.createJournalEntry(
      basePayload,
      'user_stable_1',
    );

    expect(second).toEqual(first);
    expect(second).not.toHaveProperty('id');
    expect(second).not.toHaveProperty('idempotencyHash');
    expect(prisma.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it('recovers a concurrent idempotent create after the database unique constraint wins the race', async () => {
    const { service, prisma } = makeService();
    let stored: ReturnType<typeof internalJournalRow> | null = null;
    prisma.accountingJournalEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockImplementation(() => Promise.resolve(stored));
    prisma.accountingJournalEntry.create.mockImplementation(
      ({ data }: { data: { idempotencyHash: string } }) => {
        stored = internalJournalRow({ idempotencyHash: data.idempotencyHash });
        return Promise.reject(
          Object.assign(new Error('unique conflict'), { code: 'P2002' }),
        );
      },
    );

    await expect(
      service.createJournalEntry(basePayload, 'user_stable_1'),
    ).resolves.toEqual(journalRow());
    expect(prisma.accountingAuditLog.create).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for different journal content', async () => {
    const { service, prisma } = makeService();
    let stored: ReturnType<typeof internalJournalRow> | null = null;
    prisma.accountingJournalEntry.findUnique.mockImplementation(() =>
      Promise.resolve(stored),
    );
    prisma.accountingJournalEntry.create.mockImplementation(
      ({ data }: { data: { idempotencyHash: string } }) => {
        stored = internalJournalRow({ idempotencyHash: data.idempotencyHash });
        return Promise.resolve(journalRow());
      },
    );

    await service.createJournalEntry(basePayload, 'user_stable_1');
    await expect(
      service.createJournalEntry(
        { ...basePayload, memo: 'Different content' },
        'user_stable_1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('optimistically updates an open-period journal by replacing its balanced lines', async () => {
    const { service, prisma } = makeService();
    const existing = internalJournalRow();
    const updated = journalRow({
      memo: 'Updated memo',
      updatedAt: new Date('2026-09-12T14:10:00.000Z'),
      updatedByUserStableId: 'user_stable_2',
      version: 2,
    });
    prisma.accountingJournalEntry.findUnique
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    prisma.accountingJournalEntry.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.updateJournalEntry(
        'journal_stable_1',
        {
          kind: AccountingJournalEntryKind.STANDARD,
          occurredAt: basePayload.occurredAt,
          currency: 'CAD',
          memo: 'Updated memo',
          lines: basePayload.lines,
          lastKnownUpdatedAt: existing.updatedAt.toISOString(),
        },
        'user_stable_2',
      ),
    ).resolves.toBe(updated);

    expect(prisma.accountingJournalEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyHash: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
          updatedByUserStableId: 'user_stable_2',
          version: { increment: 1 },
        }) as unknown,
      }) as unknown,
    );
    expect(prisma.accountingJournalLine.deleteMany).toHaveBeenCalledWith({
      where: { entryId: 'journal-db-id' },
    });
    expect(prisma.accountingJournalLine.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        entityId: 'journal_stable_1',
        operatorUserId: 'user_stable_2',
        beforeJson: journalRow(),
        afterJson: updated,
      }) as unknown,
    });
  });

  it('rejects a stale optimistic update before replacing lines or auditing', async () => {
    const { service, prisma } = makeService();
    const existing = internalJournalRow();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(existing);
    prisma.accountingJournalEntry.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateJournalEntry(
        'journal_stable_1',
        {
          kind: AccountingJournalEntryKind.STANDARD,
          occurredAt: basePayload.occurredAt,
          lines: basePayload.lines,
          lastKnownUpdatedAt: existing.updatedAt.toISOString(),
        },
        'user_stable_2',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.accountingJournalLine.deleteMany).not.toHaveBeenCalled();
    expect(prisma.accountingAuditLog.create).not.toHaveBeenCalled();
  });

  it('soft-deletes a journal row, increments its version and records DELETE audit evidence', async () => {
    const { service, prisma } = makeService();
    const existing = journalRow();
    const deleted = journalRow({
      deletedAt: new Date('2026-09-12T15:00:00.000Z'),
      version: 2,
      updatedByUserStableId: 'user_stable_3',
    });
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(existing);
    prisma.accountingJournalEntry.update.mockResolvedValue(deleted);

    await expect(
      service.deleteJournalEntry('journal_stable_1', 'user_stable_3'),
    ).resolves.toEqual({ ok: true });

    expect(prisma.accountingJournalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entryStableId: 'journal_stable_1' },
        data: {
          deletedAt: expect.any(Date) as unknown,
          updatedByUserStableId: 'user_stable_3',
          version: { increment: 1 },
        },
      }) as unknown,
    );
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DELETE',
        entityId: 'journal_stable_1',
        operatorUserId: 'user_stable_3',
        beforeJson: existing,
        afterJson: deleted,
      }) as unknown,
    });
  });

  it('keeps journal mutation and audit evidence in the same transaction unit', async () => {
    const { service, prisma } = makeService();
    prisma.accountingJournalEntry.findUnique.mockResolvedValue(null);
    prisma.accountingJournalEntry.create.mockResolvedValue(journalRow());
    prisma.accountingAuditLog.create.mockRejectedValue(
      new Error('audit failed'),
    );

    await expect(
      service.createJournalEntry(basePayload, 'user_stable_1'),
    ).rejects.toThrow('audit failed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
