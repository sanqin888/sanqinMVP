import { AccountingTxType } from '@prisma/client';
import { AccountingService } from './accounting.service';

describe('AccountingService canonical store timezone characterization', () => {
  it('uses StoreConfig timezone boundaries for sales dimension dates', async () => {
    const readPaidTotalDimensionsForRange = jest.fn().mockResolvedValue({
      byChannel: [{ key: 'in_store', amountCents: 2653 }],
      byPaymentMethod: [
        { key: 'CASH', amountCents: 2146 },
        { key: 'CARD', amountCents: 507 },
      ],
    });
    const prisma = {
      accountingAutomationConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
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
      { readPaidTotalDimensionsForRange } as never,
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

    expect(readPaidTotalDimensionsForRange).toHaveBeenCalledWith(
      new Date('2026-09-02T04:00:00.000Z'),
      new Date('2026-09-03T03:59:59.999Z'),
    );
  });

  it('derives year and month locks from the StoreConfig timezone', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const prisma = {
      accountingPeriodClose: { findUnique },
    };
    const brandStoreConfigReader = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
      }),
    };
    const service = new AccountingService(
      prisma as never,
      brandStoreConfigReader as never,
      {} as never,
    );

    await service.assertEditableForPeriod(
      new Date('2026-01-01T04:30:00.000Z'),
      AccountingTxType.EXPENSE,
    );

    expect(
      brandStoreConfigReader.getConfiguredStoreSnapshot,
    ).toHaveBeenCalledTimes(1);
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
