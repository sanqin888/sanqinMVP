import type { PrismaService } from '../../../../prisma/prisma.service';
import { UberMenuWriteTransactionPrismaAdapter } from './uber-menu-write-transaction-prisma.adapter';

describe('UberMenuWriteTransactionPrismaAdapter', () => {
  it('runs the write and durable telemetry on the transaction client', async () => {
    type OpsEventCreate = (input: {
      data: { eventName: string };
    }) => Promise<object>;
    const create: jest.MockedFunction<OpsEventCreate> = jest
      .fn()
      .mockResolvedValue({});
    const row = {
      priceCents: 1200,
      isAvailable: true,
      menuItemStableId: 'item-1',
    };
    const transactionClient = {
      uberItemChannelConfig: { upsert: jest.fn().mockResolvedValue(row) },
      opsEvent: { create },
    };
    const $transaction = jest.fn(
      (work: (client: typeof transactionClient) => Promise<unknown>) =>
        work(transactionClient),
    );
    const adapter = new UberMenuWriteTransactionPrismaAdapter({
      $transaction,
    } as unknown as PrismaService);

    await adapter.execute((commands) =>
      commands.upsertUberItemChannelConfig({
        storeId: 'store-1',
        menuItemStableId: 'item-1',
        priceCents: 1200,
      }),
    );

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.uberItemChannelConfig.upsert).toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
    expect(create.mock.calls[0]?.[0].data.eventName).toBe(
      'ubereats_price_book_item_upserted',
    );
  });

  it('propagates a durable side-effect failure through the transaction boundary', async () => {
    const failure = new Error('telemetry unavailable');
    const transactionClient = {
      uberItemChannelConfig: {
        upsert: jest.fn().mockResolvedValue({
          priceCents: 1200,
          isAvailable: true,
        }),
      },
      opsEvent: { create: jest.fn().mockRejectedValue(failure) },
    };
    const $transaction = jest.fn(
      async (work: (client: typeof transactionClient) => Promise<unknown>) =>
        work(transactionClient),
    );
    const adapter = new UberMenuWriteTransactionPrismaAdapter({
      $transaction,
    } as unknown as PrismaService);

    await expect(
      adapter.execute((commands) =>
        commands.upsertUberItemChannelConfig({
          menuItemStableId: 'item-1',
          priceCents: 1200,
        }),
      ),
    ).rejects.toBe(failure);
    expect($transaction).toHaveBeenCalledTimes(1);
  });
});
