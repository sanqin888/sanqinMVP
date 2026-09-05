import { LoyaltyOrderUsageReadService } from './loyalty-order-usage-read.service';

describe('LoyaltyOrderUsageReadService', () => {
  it('reads order usage directly by orderStableId and preserves balance/points projection math', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { target: 'BALANCE', deltaMicro: -3_000_000n },
      { target: 'POINTS', deltaMicro: 1_250_000n },
      { target: 'POINTS', deltaMicro: -250_000n },
    ]);
    const service = new LoyaltyOrderUsageReadService({
      loyaltyLedger: { findMany },
    } as never);

    await expect(
      service.getOrderUsage({ orderStableId: '  order-stable-1  ' }),
    ).resolves.toEqual({
      balancePaidCents: 300,
      pointsEarned: 1,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        orderStableId: 'order-stable-1',
        OR: [
          { target: 'BALANCE', type: 'REDEEM_ON_ORDER' },
          {
            target: 'POINTS',
            type: { in: ['EARN_ON_PURCHASE', 'AMEND_EARN_ADJUST'] },
          },
        ],
      },
      select: { target: true, deltaMicro: true },
    });
  });

  it('returns zero usage for an empty stable identity without querying persistence', async () => {
    const findMany = jest.fn();
    const service = new LoyaltyOrderUsageReadService({
      loyaltyLedger: { findMany },
    } as never);

    await expect(
      service.getOrderUsage({ orderStableId: '   ' }),
    ).resolves.toEqual({
      balancePaidCents: 0,
      pointsEarned: 0,
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});
