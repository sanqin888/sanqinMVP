import { AccountingTxType } from '@prisma/client';
import { AccountingService } from './accounting.service';

describe('AccountingService canonical store timezone characterization', () => {
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
