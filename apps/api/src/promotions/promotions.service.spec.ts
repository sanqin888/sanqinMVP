import { Channel } from '@prisma/client';
import { PromotionsService } from './promotions.service';

describe('PromotionsService canonical store timezone', () => {
  it('reads promotion time from the StoreConfig snapshot without BusinessConfig', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      promotionRule: { findMany },
    };
    const brandStoreConfigReader = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
      }),
    };
    const service = new PromotionsService(
      prisma as never,
      brandStoreConfigReader as never,
    );

    const result = await service.getOrderPromotionContext(Channel.web);

    expect(result.rules).toEqual([]);
    expect(result.now.weekday).toBeGreaterThanOrEqual(1);
    expect(result.now.weekday).toBeLessThanOrEqual(7);
    expect(
      brandStoreConfigReader.getConfiguredStoreSnapshot,
    ).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        channels: { has: Channel.web },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    expect('businessConfig' in prisma).toBe(false);
  });
});
