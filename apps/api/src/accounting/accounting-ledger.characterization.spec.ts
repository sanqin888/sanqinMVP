import { ConflictException } from '@nestjs/common';
import { AccountingSourceType, AccountingTxType } from '@prisma/client';
import { AccountingService } from './accounting.service';

describe('AccountingService ledger characterization', () => {
  const makeService = () => {
    const prisma = {
      accountingAutomationConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      accountingPeriodClose: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      accountingCategory: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'category-db-id',
          isActive: true,
          type: AccountingTxType.EXPENSE,
        }),
      },
      accountingAccount: {
        findUnique: jest.fn(),
      },
      accountingTransaction: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      accountingAuditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
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

  const basePayload = {
    type: AccountingTxType.EXPENSE,
    source: AccountingSourceType.MANUAL,
    amountCents: 1250,
    occurredAt: '2026-09-11T14:00:00.000Z',
    categoryStableId: 'expense_food',
    idempotencyKey: 'manual:expense:1',
    counterparty: '  Supplier  ',
    memo: '  prep ingredients  ',
  };

  it('creates a ledger row with the operator stable identity and records CREATE audit evidence', async () => {
    const { service, prisma } = makeService();
    const created = {
      txStableId: 'accttx_created',
      type: AccountingTxType.EXPENSE,
      source: AccountingSourceType.MANUAL,
      amountCents: 1250,
    };
    prisma.accountingTransaction.findUnique.mockResolvedValue(null);
    prisma.accountingTransaction.create.mockResolvedValue(created);

    await expect(service.createTx(basePayload, 'user_stable_1')).resolves.toBe(
      created,
    );

    expect(prisma.accountingTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AccountingTxType.EXPENSE,
          source: AccountingSourceType.MANUAL,
          amountCents: 1250,
          occurredAt: new Date('2026-09-11T14:00:00.000Z'),
          categoryId: 'category-db-id',
          orderId: null,
          idempotencyKey: 'manual:expense:1',
          counterparty: 'Supplier',
          memo: 'prep ingredients',
          createdByUserId: 'user_stable_1',
          updatedByUserId: 'user_stable_1',
        }),
      }),
    );
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        entityType: 'ACCOUNTING_TRANSACTION',
        entityId: 'accttx_created',
        operatorUserId: 'user_stable_1',
      }),
    });
  });

  it('returns an existing idempotent transaction without creating or auditing a duplicate', async () => {
    const { service, prisma } = makeService();
    const existing = { txStableId: 'accttx_existing' };
    prisma.accountingTransaction.findUnique.mockResolvedValue(existing);

    await expect(service.createTx(basePayload, 'user_stable_1')).resolves.toBe(
      existing,
    );

    expect(prisma.accountingTransaction.create).not.toHaveBeenCalled();
    expect(prisma.accountingAuditLog.create).not.toHaveBeenCalled();
  });

  it('updates only the caller-observed version and records before/after audit evidence', async () => {
    const { service, prisma } = makeService();
    const existing = {
      txStableId: 'accttx_1',
      occurredAt: new Date('2026-09-11T14:00:00.000Z'),
      updatedAt: new Date('2026-09-11T14:10:00.000Z'),
      type: AccountingTxType.EXPENSE,
      deletedAt: null,
    };
    const updated = {
      ...existing,
      amountCents: 1500,
      updatedAt: new Date('2026-09-11T14:20:00.000Z'),
    };
    prisma.accountingTransaction.findUnique
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    prisma.accountingTransaction.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.updateTx(
        'accttx_1',
        {
          ...basePayload,
          amountCents: 1500,
          lastKnownUpdatedAt: '2026-09-11T14:10:00.000Z',
        },
        'user_stable_2',
      ),
    ).resolves.toBe(updated);

    expect(prisma.accountingTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          txStableId: 'accttx_1',
          deletedAt: null,
          updatedAt: new Date('2026-09-11T14:10:00.000Z'),
        },
        data: expect.objectContaining({
          amountCents: 1500,
          updatedByUserId: 'user_stable_2',
          version: { increment: 1 },
        }),
      }),
    );
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        entityId: 'accttx_1',
        operatorUserId: 'user_stable_2',
        beforeJson: existing,
        afterJson: updated,
      }),
    });
  });

  it('rejects a stale optimistic update without writing audit evidence', async () => {
    const { service, prisma } = makeService();
    prisma.accountingTransaction.findUnique.mockResolvedValue({
      txStableId: 'accttx_1',
      occurredAt: new Date('2026-09-11T14:00:00.000Z'),
      updatedAt: new Date('2026-09-11T14:10:00.000Z'),
      type: AccountingTxType.EXPENSE,
      deletedAt: null,
    });
    prisma.accountingTransaction.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateTx(
        'accttx_1',
        {
          ...basePayload,
          lastKnownUpdatedAt: '2026-09-11T14:09:00.000Z',
        },
        'user_stable_2',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.accountingAuditLog.create).not.toHaveBeenCalled();
  });

  it('soft-deletes a ledger row, increments its version, and records DELETE audit evidence', async () => {
    const { service, prisma } = makeService();
    const existing = {
      txStableId: 'accttx_1',
      occurredAt: new Date('2026-09-11T14:00:00.000Z'),
      type: AccountingTxType.EXPENSE,
      deletedAt: null,
    };
    const deleted = {
      ...existing,
      deletedAt: new Date('2026-09-11T15:00:00.000Z'),
    };
    prisma.accountingTransaction.findUnique.mockResolvedValue(existing);
    prisma.accountingTransaction.update.mockResolvedValue(deleted);

    await expect(service.deleteTx('accttx_1', 'user_stable_3')).resolves.toEqual({
      ok: true,
    });

    expect(prisma.accountingTransaction.update).toHaveBeenCalledWith({
      where: { txStableId: 'accttx_1' },
      data: {
        deletedAt: expect.any(Date),
        updatedByUserId: 'user_stable_3',
        version: { increment: 1 },
      },
    });
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DELETE',
        entityId: 'accttx_1',
        operatorUserId: 'user_stable_3',
        beforeJson: existing,
        afterJson: deleted,
      }),
    });
  });
});
