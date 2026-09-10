import { OrderExternalTransitionCoordinatorService } from './order-external-transition.service';

const completedAt = new Date('2026-09-10T16:00:00.000Z');

const completion = (
  overrides: Partial<{
    externalOrderId: string;
    acceptanceConfirmed: boolean;
  }> = {},
) => ({
  externalOrderId: overrides.externalOrderId ?? 'order-1',
  completedAt,
  acceptanceConfirmed: overrides.acceptanceConfirmed ?? false,
});

const serviceWithTransaction = <T extends object>(tx: T) =>
  new OrderExternalTransitionCoordinatorService({
    $transaction: jest.fn((work: (client: T) => unknown) => work(tx)),
  } as never);

describe('OrderExternalTransitionCoordinatorService', () => {
  it('returns false without touching canonical Order when the external fence is lost', async () => {
    const findUnique = jest.fn();
    const tx = { order: { findUnique } };
    const service = serviceWithTransaction(tx);
    const extension = jest.fn().mockResolvedValue(null);

    await expect(
      service.completeProviderConfirmedTransition(
        {
          channel: 'ubereats',
          transition: { from: 'pending', to: 'paid' },
        },
        extension,
      ),
    ).resolves.toBe(false);

    expect(extension).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('moves accepted orders to paid and appends the accepted lifecycle in the same transaction', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-db-1',
          orderStableId: 'stable-1',
          status: 'pending',
        }),
        updateMany,
      },
      opsEvent: { createMany },
    };
    const service = serviceWithTransaction(tx);
    const extension = jest
      .fn()
      .mockResolvedValue(completion({ acceptanceConfirmed: true }));

    await expect(
      service.completeProviderConfirmedTransition(
        {
          channel: 'ubereats',
          transition: { from: 'pending', to: 'paid' },
        },
        extension,
      ),
    ).resolves.toBe(true);

    expect(extension).toHaveBeenCalledWith(tx);
    expect(tx.order.findUnique).toHaveBeenCalledWith({
      where: { clientRequestId: 'ubereats:order-1' },
      select: { id: true, orderStableId: true, status: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'order-db-1', status: 'pending' },
      data: {
        status: 'paid',
        makingAt: undefined,
        readyAt: undefined,
      },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'order.accepted:stable-1',
        eventName: 'order.accepted',
        source: 'orders.lifecycle',
        payload: { orderStableId: 'stable-1' },
      },
      skipDuplicates: true,
    });
  });

  it('records the provider completion timestamp when moving an order to ready', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const createMany = jest.fn();
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-db-1',
          orderStableId: 'stable-1',
          status: 'making',
        }),
        updateMany,
      },
      opsEvent: { createMany },
    };
    const service = serviceWithTransaction(tx);

    await expect(
      service.completeProviderConfirmedTransition(
        {
          channel: 'ubereats',
          transition: { from: 'making', to: 'ready' },
        },
        jest.fn().mockResolvedValue(completion()),
      ),
    ).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'order-db-1', status: 'making' },
      data: {
        status: 'ready',
        makingAt: undefined,
        readyAt: completedAt,
      },
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('replays acceptance idempotently when the canonical order already reached paid', async () => {
    const updateMany = jest.fn();
    const createMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-db-1',
          orderStableId: 'stable-1',
          status: 'paid',
        }),
        updateMany,
      },
      opsEvent: { createMany },
    };
    const service = serviceWithTransaction(tx);

    await expect(
      service.completeProviderConfirmedTransition(
        {
          channel: 'ubereats',
          transition: { from: 'pending', to: 'paid' },
        },
        jest.fn().mockResolvedValue(completion({ acceptanceConfirmed: true })),
      ),
    ).resolves.toBe(true);

    expect(updateMany).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'order.accepted:stable-1',
        }) as unknown,
        skipDuplicates: true,
      }),
    );
  });

  it('rechecks a conditional update race before deciding whether the target was reached', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'order-db-1',
        orderStableId: 'stable-1',
        status: 'pending',
      })
      .mockResolvedValueOnce({ status: 'paid' });
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      order: {
        findUnique,
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      opsEvent: { createMany },
    };
    const service = serviceWithTransaction(tx);

    await expect(
      service.completeProviderConfirmedTransition(
        {
          channel: 'ubereats',
          transition: { from: 'pending', to: 'paid' },
        },
        jest.fn().mockResolvedValue(completion({ acceptanceConfirmed: true })),
      ),
    ).resolves.toBe(true);

    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(createMany).toHaveBeenCalledTimes(1);
  });

  it('allows a provider action with no canonical transition to complete without an Order lookup', async () => {
    const findUnique = jest.fn();
    const tx = { order: { findUnique } };
    const service = serviceWithTransaction(tx);

    await expect(
      service.completeProviderConfirmedTransition(
        { channel: 'ubereats', transition: null },
        jest.fn().mockResolvedValue(completion()),
      ),
    ).resolves.toBe(true);

    expect(findUnique).not.toHaveBeenCalled();
  });

  it('propagates accepted lifecycle persistence failure so the owning transaction can roll back', async () => {
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-db-1',
          orderStableId: 'stable-1',
          status: 'pending',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      opsEvent: {
        createMany: jest
          .fn()
          .mockRejectedValue(new Error('lifecycle store unavailable')),
      },
    };
    const service = serviceWithTransaction(tx);

    await expect(
      service.completeProviderConfirmedTransition(
        {
          channel: 'ubereats',
          transition: { from: 'pending', to: 'paid' },
        },
        jest.fn().mockResolvedValue(completion({ acceptanceConfirmed: true })),
      ),
    ).rejects.toThrow('lifecycle store unavailable');
  });
});
