import { ConflictException } from '@nestjs/common';
import { AccountingJournalService } from './accounting-journal.service';

describe('Accounting canonical revenue cutover guard', () => {
  const makeService = (legacyCount: number) => {
    const prisma = {
      accountingTransaction: {
        count: jest.fn().mockResolvedValue(legacyCount),
      },
    };
    const service = new AccountingJournalService(
      prisma as never,
      {} as never,
    );
    return { service, prisma };
  };

  it('allows canonical replay when no retired AUTO_ORDER accrual row exists', async () => {
    const { service, prisma } = makeService(0);

    await expect(
      service.assertNoLegacyOrderRevenueAccrual(),
    ).resolves.toBeUndefined();
    expect(prisma.accountingTransaction.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { idempotencyKey: { startsWith: 'AUTO_ORDER:' } },
          { idempotencyKey: { startsWith: 'AUTO_ORDER_DAILY:' } },
        ],
      },
    });
  });

  it('blocks canonical replay if any retired order-revenue accrual row exists', async () => {
    const { service } = makeService(1);

    await expect(
      service.assertNoLegacyOrderRevenueAccrual(),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
