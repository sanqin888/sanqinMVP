import { ForbiddenException } from '@nestjs/common';
import { AccountingTxType } from '@prisma/client';
import { AccountingService } from './accounting.service';

describe('AccountingService period-close characterization', () => {
  const makeService = () => {
    const tx = {
      accountingAutomationConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      accountingPeriodClose: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
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

  it('blocks ordinary entries in a closed month but keeps ADJUSTMENT writable until the year is hard-locked', async () => {
    const { service, prisma } = makeService();
    prisma.accountingPeriodClose.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'month-close' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'month-close' });
    const occurredAt = new Date('2026-09-11T14:00:00.000Z');

    await expect(
      service.assertEditableForPeriod(occurredAt, AccountingTxType.EXPENSE),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assertEditableForPeriod(occurredAt, AccountingTxType.ADJUSTMENT),
    ).resolves.toBeUndefined();
  });

  it('closes a Toronto business month with Store-local UTC bounds and PERIOD_CLOSE audit evidence', async () => {
    const { service, prisma } = makeService();
    const close = {
      periodType: 'MONTH',
      periodKey: '2026-09',
      startAt: new Date('2026-09-01T04:00:00.000Z'),
      endAt: new Date('2026-10-01T03:59:59.999Z'),
      closedByUserId: 'user_stable_1',
      closedAt: new Date('2026-09-30T20:00:00.000Z'),
    };
    prisma.accountingPeriodClose.upsert.mockResolvedValue(close);

    await expect(service.closeMonth('2026-09', 'user_stable_1')).resolves.toBe(
      close,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.accountingPeriodClose.upsert).toHaveBeenCalledWith({
      where: {
        periodType_periodKey: {
          periodType: 'MONTH',
          periodKey: '2026-09',
        },
      },
      create: {
        periodType: 'MONTH',
        periodKey: '2026-09',
        startAt: new Date('2026-09-01T04:00:00.000Z'),
        endAt: new Date('2026-10-01T03:59:59.999Z'),
        closedByUserId: 'user_stable_1',
      },
      update: {
        startAt: new Date('2026-09-01T04:00:00.000Z'),
        endAt: new Date('2026-10-01T03:59:59.999Z'),
        closedByUserId: 'user_stable_1',
        closedAt: expect.any(Date) as unknown as Date,
      },
      select: {
        periodType: true,
        periodKey: true,
        startAt: true,
        endAt: true,
        closedByUserId: true,
        closedAt: true,
      },
    });
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'PERIOD_CLOSE',
        entityType: 'ACCOUNTING_PERIOD',
        entityId: '2026-09',
        operatorUserId: 'user_stable_1',
      }) as unknown as Record<string, unknown>,
    });
  });

  it('reopens an existing month only while its fiscal year is not hard-locked and records PERIOD_REOPEN evidence', async () => {
    const { service, prisma } = makeService();
    const existingClose = {
      periodType: 'MONTH',
      periodKey: '2026-09',
      startAt: new Date('2026-09-01T04:00:00.000Z'),
      endAt: new Date('2026-10-01T03:59:59.999Z'),
      closedByUserId: 'user_stable_1',
      closedAt: new Date('2026-10-01T12:00:00.000Z'),
    };
    prisma.accountingPeriodClose.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingClose);

    await expect(
      service.reopenMonth('2026-09', 'user_stable_2'),
    ).resolves.toEqual({ reopened: true, periodKey: '2026-09' });

    expect(prisma.accountingPeriodClose.delete).toHaveBeenCalledWith({
      where: {
        periodType_periodKey: {
          periodType: 'MONTH',
          periodKey: '2026-09',
        },
      },
    });
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'PERIOD_REOPEN',
        entityType: 'ACCOUNTING_PERIOD',
        entityId: '2026-09',
        operatorUserId: 'user_stable_2',
        beforeJson: existingClose,
      }) as unknown as Record<string, unknown>,
    });
  });

  it('hard-locks only the months at or after the configured accounting start month', async () => {
    const { service, prisma } = makeService();
    prisma.accountingAutomationConfig.findUnique.mockResolvedValue({
      accountingStartDate: new Date('2026-09-11T00:00:00.000Z'),
    });
    prisma.accountingPeriodClose.findMany.mockResolvedValue([
      { periodKey: '2026-09' },
      { periodKey: '2026-10' },
      { periodKey: '2026-11' },
      { periodKey: '2026-12' },
    ]);
    const close = {
      periodType: 'YEAR',
      periodKey: '2026',
      startAt: new Date('2026-01-01T05:00:00.000Z'),
      endAt: new Date('2027-01-01T04:59:59.999Z'),
      closedByUserId: 'user_stable_2',
      closedAt: new Date('2027-01-05T15:00:00.000Z'),
    };
    prisma.accountingPeriodClose.upsert.mockResolvedValue(close);

    await expect(service.closeYear('2026', 'user_stable_2')).resolves.toBe(
      close,
    );

    expect(prisma.accountingPeriodClose.findMany).toHaveBeenCalledWith({
      where: {
        periodType: 'MONTH',
        periodKey: {
          in: ['2026-09', '2026-10', '2026-11', '2026-12'],
        },
      },
      select: { periodKey: true },
    });
    expect(prisma.accountingPeriodClose.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          periodType: 'YEAR',
          periodKey: '2026',
          startAt: new Date('2026-01-01T05:00:00.000Z'),
          endAt: new Date('2027-01-01T04:59:59.999Z'),
          closedByUserId: 'user_stable_2',
        }) as unknown as Record<string, unknown>,
      }) as unknown,
    );
    expect(prisma.accountingAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'YEAR_LOCK',
        entityId: '2026',
        operatorUserId: 'user_stable_2',
      }) as unknown as Record<string, unknown>,
    });
  });
});
