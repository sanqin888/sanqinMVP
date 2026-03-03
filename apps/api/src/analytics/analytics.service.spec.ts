import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const createService = () => {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const service = new AnalyticsService(prisma as never);
    return { service, prisma };
  };

  it('skips admin path events', async () => {
    const { service, prisma } = createService();

    const accepted = await service.ingestBatch(
      [{ event: 'customer_home_viewed' }],
      { path: '/zh/admin/orders' },
    );

    expect(accepted).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips pos path events', async () => {
    const { service, prisma } = createService();

    const accepted = await service.ingestBatch(
      [{ event: 'customer_home_viewed' }],
      { path: '/en/store/pos' },
    );

    expect(accepted).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts customer path events', async () => {
    const { service, prisma } = createService();

    const accepted = await service.ingestBatch(
      [{ event: 'customer_home_viewed' }],
      { path: '/zh/checkout' },
    );

    expect(accepted).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
