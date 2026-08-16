import type { PrismaService } from '../../../../prisma/prisma.service';
import { UberMenuWriteTransactionPrismaAdapter } from './uber-menu-write-transaction-prisma.adapter';

const semantics = {
  samePayload: 'RETURN_SAME_BUSINESS_STATE',
  differentPayload: 'UPDATE_RESOURCE',
  sideEffects: 'DEDUPLICATE_BY_RESOURCE_AND_RESULTING_STATE',
  concurrency: 'CONVERGE_BY_UNIQUE_RESOURCE_KEY',
} as const;

const itemCommand = {
  resourceKey: { storeId: 'store-1', menuItemStableId: 'item-1' },
  payload: {
    storeId: 'store-1',
    menuItemStableId: 'item-1',
    priceCents: 1200,
  },
  semantics,
} as const;

const storeMapping = () => ({
  findFirst: jest.fn().mockResolvedValue({
    uberStoreId: 'store-1',
    posExternalStoreId: 'pos-room-1',
  }),
});

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
      uberStoreMapping: storeMapping(),
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
      commands.upsertUberItemChannelConfig(itemCommand),
    );

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.uberStoreMapping.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isProvisioned: true }),
      }),
    );
    expect(transactionClient.uberItemChannelConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ storeId: 'pos-room-1' }),
      }),
    );
    expect(upsert).toHaveBeenCalled();
    expect(upsert.mock.calls[0]?.[0].create.eventName).toBe(
      'ubereats_price_book_item_upserted',
    );
  });

  it('does not commit business data or events when transactional event persistence fails', async () => {
    const failure = new Error('telemetry unavailable');
    type DatabaseState = { businessRows: number; events: number };
    type DatabaseWrite = () => Promise<{
      priceCents?: number;
      isAvailable?: boolean;
    }>;
    const committed: DatabaseState = { businessRows: 0, events: 0 };
    const writeBusinessConfig = (state: DatabaseState) =>
      jest.fn().mockImplementation(() => {
        state.businessRows += 1;
        return Promise.resolve({ priceCents: 1200, isAvailable: true });
      });
    const writeEvent = (state: DatabaseState) =>
      jest.fn().mockImplementation(() => {
        // The database rejects this insert before it can become durable.
        void state;
        return Promise.reject(failure);
      });
    const rootClient = {
      uberStoreMapping: storeMapping(),
      uberItemChannelConfig: { upsert: writeBusinessConfig(committed) },
      opsEvent: { upsert: writeEvent(committed) },
    };
    let transactionClient:
      | {
          uberStoreMapping: ReturnType<typeof storeMapping>;
          uberItemChannelConfig: {
            upsert: jest.MockedFunction<DatabaseWrite>;
          };
          opsEvent: { upsert: jest.MockedFunction<DatabaseWrite> };
        }
      | undefined;
    const $transaction = jest.fn(
      async (
        work: (
          client: NonNullable<typeof transactionClient>,
        ) => Promise<unknown>,
      ) => {
        const staged = { ...committed };
        transactionClient = {
          uberStoreMapping: storeMapping(),
          uberItemChannelConfig: { upsert: writeBusinessConfig(staged) },
          opsEvent: { upsert: writeEvent(staged) },
        };

        const result = await work(transactionClient);
        Object.assign(committed, staged);
        return result;
      },
    );
    const prismaClient = {
      ...rootClient,
      $transaction,
    };
    const adapter = new UberMenuWriteTransactionPrismaAdapter(
      prismaClient as unknown as PrismaService,
    );

    await expect(
      adapter.execute((commands) =>
        commands.upsertUberItemChannelConfig(itemCommand),
      ),
    ).rejects.toBe(failure);
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(
      transactionClient?.uberItemChannelConfig.upsert,
    ).toHaveBeenCalledTimes(1);
    expect(transactionClient?.opsEvent.upsert).toHaveBeenCalledTimes(1);
    expect(rootClient.uberItemChannelConfig.upsert).not.toHaveBeenCalled();
    expect(rootClient.opsEvent.upsert).not.toHaveBeenCalled();
    expect(committed).toEqual({ businessRows: 0, events: 0 });
  });

  it('replays once when concurrent creation loses a unique-key race', async () => {
    const converged = { ok: true, storeId: 'store-1' };
    const $transaction = jest
      .fn()
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockImplementationOnce(
        (work: (client: object) => Promise<typeof converged>) => work({}),
      );
    const adapter = new UberMenuWriteTransactionPrismaAdapter({
      $transaction,
    } as unknown as PrismaService);

    await expect(
      adapter.execute(() => Promise.resolve(converged)),
    ).resolves.toBe(converged);
    expect($transaction).toHaveBeenCalledTimes(2);
  });
});
