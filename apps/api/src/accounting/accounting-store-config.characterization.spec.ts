import { AccountingTxType } from '@prisma/client';
import { AccountingService } from './accounting.service';

describe('AccountingService canonical store timezone characterization', () => {
  it('uses StoreConfig timezone boundaries for sales dimension dates', async () => {
    const orderFindMany = jest.fn().mockResolvedValue([
      {
        totalCents: 2146,
        channel: 'in_store',
        paymentMethod: 'CASH',
      },
      {
        totalCents: 507,
        channel: 'in_store',
        paymentMethod: 'CARD',
      },
    ]);
    const prisma = {
      accountingAutomationConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      order: { findMany: orderFindMany },
    };
    const brandStoreConfigReader = {
      getStoreSnapshot: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
      }),
    };
    const service = new AccountingService(
      prisma as never,
      brandStoreConfigReader as never,
    );

    await expect(
      service.dimensionSlice({ from: '2026-09-02', to: '2026-09-02' }),
    ).resolves.toEqual({
      from: '2026-09-02',
      to: '2026-09-02',
      byChannel: [{ key: 'in_store', amountCents: 2653 }],
      byPaymentMethod: [
        { key: 'CASH', amountCents: 2146 },
        { key: 'CARD', amountCents: 507 },
      ],
    });

    expect(orderFindMany).toHaveBeenCalledWith({
      where: {
        paidAt: {
          gte: new Date('2026-09-02T04:00:00.000Z'),
          lte: new Date('2026-09-03T03:59:59.999Z'),
        },
      },
      select: {
        totalCents: true,
        channel: true,
        paymentMethod: true,
      },
    });
  });

  it('derives year and month locks from the StoreConfig timezone', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const prisma = {
      accountingPeriodClose: { findUnique },
    };
    const brandStoreConfigReader = {
      getStoreSnapshot: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
      }),
    };
    const service = new AccountingService(
      prisma as never,
      brandStoreConfigReader as never,
    );

    await service.assertEditableForPeriod(
      new Date('2026-01-01T04:30:00.000Z'),
      AccountingTxType.EXPENSE,
    );

    expect(brandStoreConfigReader.getStoreSnapshot).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenNthCalledWith(1, {
      where: {
        periodType_periodKey: {
          periodType: 'YEAR',
          periodKey: '2025',
        },
      },
      select: { id: true },
    });
    expect(findUnique).toHaveBeenNthCalledWith(2, {
      where: {
        periodType_periodKey: {
          periodType: 'MONTH',
          periodKey: '2025-12',
        },
      },
      select: { id: true },
    });
    expect('businessConfig' in prisma).toBe(false);
  });
});
