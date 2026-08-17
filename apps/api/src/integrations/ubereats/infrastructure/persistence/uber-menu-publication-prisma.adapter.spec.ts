import { UberMenuPublicationPrismaAdapter } from './uber-menu-publication-prisma.adapter';

describe('UberMenuPublicationPrismaAdapter', () => {
  it('在同一事务中创建发布版本和 Uber item 快照映射', async () => {
    const createVersion = jest.fn().mockResolvedValue({
      id: 'version-1',
      storeId: 'pos-1',
      idempotencyKey: 'key-1',
      businessVersion: 'business-1',
      status: 'SUBMITTED',
      responsePayload: null,
    });
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      uberMenuPublishVersion: { create: createVersion },
      uberPublishedMenuItem: { createMany },
    };
    const transaction = jest
      .fn()
      .mockImplementation(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      );
    const adapter = new UberMenuPublicationPrismaAdapter({
      $transaction: transaction,
    } as never);

    await adapter.createAttempt({
      storeId: 'pos-1',
      uberStoreId: 'uber-1',
      idempotencyKey: 'key-1',
      businessVersion: 'business-1',
      payloadHash: 'hash-1',
      payload: {} as never,
      totalItems: 1,
      publishedItems: [
        {
          uberItemId: 'sanq:item-1',
          menuItemStableId: 'item-1',
          publishedPriceCents: 1200,
          publishedIsAvailable: true,
          publishedName: 'Noodles',
        },
      ],
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(createVersion).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          publishVersionId: 'version-1',
          storeId: 'pos-1',
          uberStoreId: 'uber-1',
          uberItemId: 'sanq:item-1',
          menuItemStableId: 'item-1',
          publishedPriceCents: 1200,
          publishedIsAvailable: true,
          publishedName: 'Noodles',
          publishedAt: expect.any(Date),
        },
      ],
    });
  });
});
