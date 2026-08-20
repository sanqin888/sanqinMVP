import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UberOrderPayloadParser } from './uber-order-payload.parser';

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      join(
        __dirname,
        '../../test/fixtures/uber-contract/v1/orders',
        `${name}.json`,
      ),
      'utf8',
    ),
  ) as Record<string, unknown>;

describe('Uber scheduled order normalization', () => {
  it('maps v1 preparation_time to SCHEDULED ready time without using delivery target', () => {
    const parsed = new UberOrderPayloadParser().parse(
      fixture('detail-scheduled'),
      {
        eventType: 'orders.scheduled.notification',
      },
    );

    expect(parsed).toEqual(
      expect.objectContaining({
        externalOrderId: 'fixture-order-scheduled',
        fulfillmentTiming: 'SCHEDULED',
        scheduledReadyAt: new Date('2026-08-22T17:30:00.000Z'),
        estimatedReadyAt: new Date('2026-08-22T17:30:00.000Z'),
      }),
    );
  });

  it('uses v1 preparation_time as the external estimate for immediate orders', () => {
    const parsed = new UberOrderPayloadParser().parse(fixture('detail'), {
      eventType: 'orders.notification',
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        fulfillmentTiming: 'IMMEDIATE',
        scheduledReadyAt: null,
        estimatedReadyAt: new Date('2026-08-20T13:10:00.000Z'),
      }),
    );
  });

  it('uses courier estimated pickup when scheduled preparation_time is absent', () => {
    const payload = fixture('detail-scheduled');
    const order = payload.order as Record<string, unknown>;
    delete order.preparation_time;
    order.deliveries = [
      {
        id: 'delivery-1',
        status: 'SCHEDULED',
        estimated_pick_up_time: '2026-08-22T17:35:00.000Z',
        estimated_dropoff_time: '2026-08-22T18:00:00.000Z',
      },
    ];

    const parsed = new UberOrderPayloadParser().parse(payload, {
      eventType: 'orders.scheduled.notification',
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        fulfillmentTiming: 'SCHEDULED',
        scheduledReadyAt: new Date('2026-08-22T17:35:00.000Z'),
        estimatedReadyAt: null,
      }),
    );
  });

  it('reserves a local 30-minute delivery lead only when Uber omits both pickup estimates', () => {
    const payload = fixture('detail-scheduled');
    const order = payload.order as Record<string, unknown>;
    delete order.preparation_time;
    delete order.deliveries;

    const parsed = new UberOrderPayloadParser().parse(payload, {
      eventType: 'orders.scheduled.notification',
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        fulfillmentTiming: 'SCHEDULED',
        scheduledReadyAt: new Date('2026-08-22T17:30:00.000Z'),
        estimatedReadyAt: null,
      }),
    );
  });

  it('does not subtract Uber delivery lead from scheduled pickup orders', () => {
    const payload = fixture('detail-scheduled');
    const order = payload.order as Record<string, unknown>;
    delete order.preparation_time;
    delete order.deliveries;
    order.fulfillment_type = 'PICKUP';

    const parsed = new UberOrderPayloadParser().parse(payload, {
      eventType: 'orders.scheduled.notification',
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        fulfillmentTiming: 'SCHEDULED',
        fulfillmentType: 'pickup',
        scheduledReadyAt: new Date('2026-08-22T18:00:00.000Z'),
      }),
    );
  });

  it('rejects a scheduled order only when neither ready time nor schedule target exists', () => {
    const payload = fixture('detail-scheduled');
    const order = payload.order as Record<string, unknown>;
    delete order.preparation_time;
    delete order.deliveries;
    delete order.scheduled_order_target_delivery_time_range;

    expect(
      new UberOrderPayloadParser().parseResult(payload, {
        eventType: 'orders.scheduled.notification',
      }),
    ).toEqual({
      kind: 'invalid',
      reason: 'MISSING_SCHEDULED_READY_AT',
      category: 'mapping',
    });
  });
});
