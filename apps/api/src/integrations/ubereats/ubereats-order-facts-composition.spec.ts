import { MODULE_METADATA } from '@nestjs/common/constants';

import {
  ORDER_EXTERNAL_FACTS_READER,
  type OrderExternalFactsReaderPort,
} from '../../orders/public-api';
import {
  UBER_ORDER_OPERATIONS_REPOSITORY,
  type UberOrderOperationsRepositoryPort,
} from './application/operations/uber-operations.ports';
import {
  UBER_ORDER_SYNC_REPOSITORY,
  type UberOrderSyncRepositoryPort,
} from './application/orders/uber-order-sync.ports';
import {
  UBER_CANONICAL_ORDER_FACTS_QUERY,
  type UberCanonicalOrderFactsQueryPort,
} from './application/shared/uber-canonical-order-facts.port';
import { UberEatsModule } from './ubereats.module';

const providers = (): unknown[] => {
  const value: unknown = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    UberEatsModule,
  );
  return Array.isArray(value) ? value : [];
};

const providerFor = <TPort>(token: symbol) =>
  providers().find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === token,
  ) as
    | {
        inject?: unknown[];
        useFactory?: (reader: OrderExternalFactsReaderPort) => TPort;
      }
    | undefined;

const ownerReader = (): jest.Mocked<OrderExternalFactsReaderPort> =>
  ({
    findByExternalIdentity: jest.fn().mockResolvedValue({
      orderStableId: 'stable-order-1',
      status: 'pending',
      totalCents: 1_130,
      createdAt: '2026-09-10T12:00:00.000Z',
      paidAt: null,
      fulfillmentTiming: 'SCHEDULED',
      externalEstimatedReadyAt: '2026-09-10T12:30:00.000Z',
    }),
    existsByExternalIdentity: jest.fn().mockResolvedValue(true),
    findSchedulingByOrderStableId: jest.fn().mockResolvedValue({
      orderStableId: 'stable-order-1',
      scheduledReadyAt: '2026-09-10T12:30:00.000Z',
      prepStartAt: '2026-09-10T12:15:00.000Z',
      prepDurationMinutes: 15,
    }),
    listByChannelAndStatuses: jest.fn().mockResolvedValue([
      {
        orderStableId: 'stable-order-1',
        externalOrderId: 'uber-order-1',
        pickupCode: '42',
        status: 'pending',
        totalCents: 1_130,
        createdAt: '2026-09-10T12:00:00.000Z',
      },
    ]),
    summarizeByChannelAndStatuses: jest.fn().mockResolvedValue({
      count: 1,
      latestCreatedAt: '2026-09-10T12:00:00.000Z',
    }),
    listReconciliationFacts: jest
      .fn()
      .mockResolvedValue([{ status: 'paid', totalCents: 1_130 }]),
  }) as jest.Mocked<OrderExternalFactsReaderPort>;

describe('Uber canonical Order facts composition', () => {
  it('maps stable owner facts to the Uber action/import query', async () => {
    const provider = providerFor<UberCanonicalOrderFactsQueryPort>(
      UBER_CANONICAL_ORDER_FACTS_QUERY,
    );
    expect(provider?.inject).toEqual([ORDER_EXTERNAL_FACTS_READER]);
    const reader = ownerReader();
    const query = provider!.useFactory!(reader);

    await expect(query.findByExternalOrderId('uber-order-1')).resolves.toEqual({
      orderStableId: 'stable-order-1',
      status: 'pending',
      totalCents: 1_130,
      referenceAt: new Date('2026-09-10T12:00:00.000Z'),
      fulfillmentTiming: 'SCHEDULED',
      externalEstimatedReadyAt: new Date('2026-09-10T12:30:00.000Z'),
    });
    expect(reader.findByExternalIdentity).toHaveBeenCalledWith({
      channel: 'ubereats',
      externalOrderId: 'uber-order-1',
    });

    await expect(
      query.findSchedulingByOrderStableId('stable-order-1'),
    ).resolves.toEqual({
      orderStableId: 'stable-order-1',
      scheduledReadyAt: new Date('2026-09-10T12:30:00.000Z'),
      prepStartAt: new Date('2026-09-10T12:15:00.000Z'),
      prepDurationMinutes: 15,
    });
    expect(reader.findSchedulingByOrderStableId).toHaveBeenCalledWith(
      'stable-order-1',
    );
  });

  it('maps pending list and summary semantics without exposing persistence identity', async () => {
    const provider = providerFor<UberOrderSyncRepositoryPort>(
      UBER_ORDER_SYNC_REPOSITORY,
    );
    expect(provider?.inject).toEqual([ORDER_EXTERNAL_FACTS_READER]);
    const reader = ownerReader();
    const query = provider!.useFactory!(reader);

    await expect(query.findSyncTarget('uber-order-1')).resolves.toEqual({
      orderStableId: 'stable-order-1',
      status: 'pending',
    });
    expect(reader.findByExternalIdentity).toHaveBeenCalledWith({
      channel: 'ubereats',
      externalOrderId: 'uber-order-1',
    });

    await expect(query.listPending(100)).resolves.toEqual([
      {
        orderStableId: 'stable-order-1',
        externalOrderId: 'uber-order-1',
        pickupCode: '42',
        status: 'pending',
        totalCents: 1_130,
        createdAt: new Date('2026-09-10T12:00:00.000Z'),
      },
    ]);
    await expect(query.pendingSummary()).resolves.toEqual({
      count: 1,
      updatedAt: new Date('2026-09-10T12:00:00.000Z'),
    });
    expect(reader.listByChannelAndStatuses).toHaveBeenCalledWith({
      channel: 'ubereats',
      statuses: ['pending', 'paid', 'making'],
      limit: 100,
    });
  });

  it('maps reconciliation and existence reads with the exact Uber scope', async () => {
    const provider = providerFor<UberOrderOperationsRepositoryPort>(
      UBER_ORDER_OPERATIONS_REPOSITORY,
    );
    expect(provider?.inject).toEqual([ORDER_EXTERNAL_FACTS_READER]);
    const reader = ownerReader();
    const query = provider!.useFactory!(reader);
    const rangeStart = new Date('2026-09-10T00:00:00.000Z');
    const rangeEnd = new Date('2026-09-11T00:00:00.000Z');

    await expect(
      query.reconciliationOrders(
        '4750_Yonge_Street',
        rangeStart,
        rangeEnd,
      ),
    ).resolves.toEqual([{ status: 'paid', totalCents: 1_130 }]);
    await expect(query.exists('uber-order-1')).resolves.toBe(true);
    expect(reader.listReconciliationFacts).toHaveBeenCalledWith({
      channel: 'ubereats',
      storeStableId: '4750_Yonge_Street',
      createdAtFrom: rangeStart.toISOString(),
      createdAtBefore: rangeEnd.toISOString(),
    });
    expect(reader.existsByExternalIdentity).toHaveBeenCalledWith({
      channel: 'ubereats',
      externalOrderId: 'uber-order-1',
    });
  });
});
