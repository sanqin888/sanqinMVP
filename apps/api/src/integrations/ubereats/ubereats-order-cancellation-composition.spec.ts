import { Logger } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';

import {
  ORDER_EXTERNAL_CANCELLATION_FINALIZER,
  type OrderExternalCancellationFinalizerPort,
} from '../../orders/public-api';
import {
  UBER_CANONICAL_ORDER_CANCELLATION,
  type UberCanonicalOrderCancellationPort,
} from './application/shared/uber-canonical-order-cancellation.port';
import { UberEatsModule } from './ubereats.module';

const cancellationProvider = () => {
  const value: unknown = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    UberEatsModule,
  );
  const providers: unknown[] = Array.isArray(value)
    ? (value as unknown[])
    : [];
  return providers.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === UBER_CANONICAL_ORDER_CANCELLATION,
  ) as
    | {
        inject?: unknown[];
        useFactory?: (
          finalizer: OrderExternalCancellationFinalizerPort,
        ) => UberCanonicalOrderCancellationPort;
      }
    | undefined;
};

describe('Uber canonical Order cancellation composition', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps Uber cancellation facts to the Orders owner without exposing persistence identity', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const finalizeConfirmedCancellation = jest.fn().mockResolvedValue({
      orderStableId: 'stable-order-1',
      refundCents: 1_130,
    });
    const provider = cancellationProvider();

    expect(provider?.inject).toEqual([ORDER_EXTERNAL_CANCELLATION_FINALIZER]);
    const port = provider!.useFactory!({
      finalizeConfirmedCancellation,
    });
    const occurredAt = new Date('2026-09-10T16:30:00.000Z');

    await expect(
      port.finalizeConfirmedCancellation({
        orderStableId: 'stable-order-1',
        externalOrderId: 'uber-order-1',
        externalEventId: 'uber-event-1',
        reason: 'UBER_ORDER_FAILURE',
        operatorName: 'Uber Eats',
        occurredAt,
      }),
    ).resolves.toEqual({
      orderStableId: 'stable-order-1',
      refundCents: 1_130,
    });
    expect(finalizeConfirmedCancellation).toHaveBeenCalledWith({
      channel: 'ubereats',
      orderStableId: 'stable-order-1',
      externalOrderId: 'uber-order-1',
      externalEventId: 'uber-event-1',
      reason: 'UBER_ORDER_FAILURE',
      operatorName: 'Uber Eats',
      occurredAt: '2026-09-10T16:30:00.000Z',
    });
  });
});
