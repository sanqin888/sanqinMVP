import { AccountingTxType } from '@prisma/client';
import { AccountingPeriodService } from './accounting-period.service';

describe('Accounting canonical store timezone characterization', () => {
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
    const service = new AccountingPeriodService(
      prisma as never,
      brandStoreConfigReader as never,
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
