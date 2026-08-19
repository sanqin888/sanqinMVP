import { ScheduledOrderProcessor } from './scheduled-order.processor';

describe('ScheduledOrderProcessor', () => {
  it('drains due scheduled orders until no row can be claimed', async () => {
    const activateNextDueScheduledOrder = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const processor = new ScheduledOrderProcessor({
      activateNextDueScheduledOrder,
    } as never);
    const now = new Date('2026-08-19T22:10:00.000Z');

    await expect(processor.processOnce(25, now)).resolves.toBe(2);
    expect(activateNextDueScheduledOrder).toHaveBeenCalledTimes(3);
    expect(activateNextDueScheduledOrder).toHaveBeenNthCalledWith(1, now);
  });

  it('respects the per-scan limit', async () => {
    const activateNextDueScheduledOrder = jest
      .fn()
      .mockResolvedValue(true);
    const processor = new ScheduledOrderProcessor({
      activateNextDueScheduledOrder,
    } as never);

    await expect(processor.processOnce(2)).resolves.toBe(2);
    expect(activateNextDueScheduledOrder).toHaveBeenCalledTimes(2);
  });
});
