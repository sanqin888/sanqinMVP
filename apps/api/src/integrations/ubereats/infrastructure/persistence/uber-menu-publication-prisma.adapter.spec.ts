import { UberMenuPublicationPrismaAdapter } from './uber-menu-publication-prisma.adapter';

type PublishedItemCreateManyInput = {
  data: Array<{
    publishVersionId: string;
    storeId: string;
    uberStoreId: string;
    uberItemId: string;
    menuItemStableId: string;
    publishedPriceCents: number;
    publishedIsAvailable: boolean;
    publishedName: string;
    publishedAt: Date;
  }>;
};

type PublishVersionUpdateInput = {
  where: { id: string };
  data: {
    status: string;
    responsePayload: unknown;
    errorMessage: null;
    errorDetails: unknown;
    finishedAt: null;
    confirmationLeaseToken: null;
    confirmationLeaseExpiresAt: null;
    [key: string]: unknown;
  };
};

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
    const createMany = jest
      .fn<Promise<{ count: number }>, [PublishedItemCreateManyInput]>()
      .mockResolvedValue({ count: 1 });
    const tx = {
      uberMenuPublishVersion: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: createVersion,
      },
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
    expect(createMany).toHaveBeenCalledTimes(1);
    const input = createMany.mock.calls[0]?.[0];
    expect(input?.data).toHaveLength(1);
    expect(input?.data[0]).toMatchObject({
      publishVersionId: 'version-1',
      storeId: 'pos-1',
      uberStoreId: 'uber-1',
      uberItemId: 'sanq:item-1',
      menuItemStableId: 'item-1',
      publishedPriceCents: 1200,
      publishedIsAvailable: true,
      publishedName: 'Noodles',
    });
    expect(input?.data[0]?.publishedAt).toBeInstanceOf(Date);
  });

  it('复用相同幂等键的 FAILED 记录并清除旧失败状态', async () => {
    const failed = {
      id: 'version-1',
      storeId: 'pos-1',
      idempotencyKey: 'key-1',
      businessVersion: 'business-1',
      status: 'FAILED',
      responsePayload: { code: 'old-response' },
    };
    const update = jest
      .fn<
        Promise<typeof failed & { status: string; responsePayload: null }>,
        [PublishVersionUpdateInput]
      >()
      .mockResolvedValue({
        ...failed,
        status: 'SUBMITTED',
        responsePayload: null,
      });
    const create = jest.fn();
    const createMany = jest.fn();
    const tx = {
      uberMenuPublishVersion: {
        findUnique: jest.fn().mockResolvedValue(failed),
        update,
        create,
      },
      uberPublishedMenuItem: { createMany },
    };
    const adapter = new UberMenuPublicationPrismaAdapter({
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        ),
    } as never);

    await expect(
      adapter.createAttempt({
        storeId: 'pos-1',
        uberStoreId: 'uber-1',
        idempotencyKey: 'key-1',
        businessVersion: 'business-1',
        payloadHash: 'hash-1',
        payload: {} as never,
        totalItems: 1,
        publishedItems: [],
      }),
    ).resolves.toMatchObject({
      attemptId: 'version-1',
      status: 'SUBMITTED',
    });

    expect(create).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    const updateInput = update.mock.calls[0]?.[0];
    expect(updateInput?.where).toEqual({ id: 'version-1' });
    expect(updateInput?.data).toMatchObject({
      status: 'SUBMITTED',
      errorMessage: null,
      finishedAt: null,
      confirmationLeaseToken: null,
      confirmationLeaseExpiresAt: null,
    });
    expect(updateInput?.data.responsePayload).toBeDefined();
    expect(updateInput?.data.errorDetails).toBeDefined();
  });
});
