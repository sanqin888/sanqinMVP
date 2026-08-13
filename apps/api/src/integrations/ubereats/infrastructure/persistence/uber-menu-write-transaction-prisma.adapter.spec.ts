import type { PrismaService } from '../../../../prisma/prisma.service';
import { UberMenuWriteTransactionPrismaAdapter } from './uber-menu-write-transaction-prisma.adapter';

describe('UberMenuWriteTransactionPrismaAdapter', () => {
  it('runs the write and durable telemetry on the transaction client', async () => {
    type OpsEventUpsert = (input: {
      create: { eventName: string };
    }) => Promise<object>;
    const upsert: jest.MockedFunction<OpsEventUpsert> = jest
      .fn()
      .mockResolvedValue({});
    const row = {
      priceCents: 1200,
      isAvailable: true,
      menuItemStableId: 'item-1',
    };
    const transactionClient = {
      uberItemChannelConfig: { upsert: jest.fn().mockResolvedValue(row) },
      opsEvent: { upsert },
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
    expect(upsert).toHaveBeenCalled();
    expect(upsert.mock.calls[0]?.[0].create.eventName).toBe(
      'ubereats_price_book_item_upserted',
    );
  });

  it('rolls back both business data and the event when event persistence fails', async () => {
    const failure = new Error('telemetry unavailable');
    const committed = { businessRows: 0, events: 0 };
    const staged = { businessRows: 0, events: 0 };
    const transactionClient = {
      uberItemChannelConfig: {
        upsert: jest.fn().mockImplementation(() => {
          staged.businessRows += 1;
          return Promise.resolve({ priceCents: 1200, isAvailable: true });
        }),
      },
      opsEvent: {
        upsert: jest.fn().mockImplementation(() => {
          staged.events += 1;
          return Promise.reject(failure);
        }),
      },
    };
    const $transaction = jest.fn(
      async (work: (client: typeof transactionClient) => Promise<unknown>) => {
        const result = await work(transactionClient);
        committed.businessRows += staged.businessRows;
        committed.events += staged.events;
        return result;
      },
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
    expect(staged).toEqual({ businessRows: 1, events: 1 });
    expect(committed).toEqual({ businessRows: 0, events: 0 });
  });
});
