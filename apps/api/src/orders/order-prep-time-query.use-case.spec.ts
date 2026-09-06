import type { PrismaService } from './orders-prisma';
import { OrderPrepTimeQueryUseCase } from './order-prep-time-query.use-case';

describe('OrderPrepTimeQueryUseCase', () => {
  it('returns the historical 15-minute fallback when no recent completed orders exist', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const useCase = new OrderPrepTimeQueryUseCase({
      order: { findMany },
    } as unknown as PrismaService);

    await expect(useCase.getAveragePrepTimeMinutes()).resolves.toBe(15);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('preserves averaging and the 5-minute lower bound', async () => {
    const now = Date.now();
    const findMany = jest.fn().mockResolvedValue([
      {
        makingAt: new Date(now - 4 * 60_000),
        readyAt: new Date(now),
      },
      {
        makingAt: new Date(now - 6 * 60_000),
        readyAt: new Date(now),
      },
    ]);
    const useCase = new OrderPrepTimeQueryUseCase({
      order: { findMany },
    } as unknown as PrismaService);

    await expect(useCase.getAveragePrepTimeMinutes()).resolves.toBe(5);
  });
});
