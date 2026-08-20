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
        externalOrderId: 'fixture-scheduled-order-001',
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

  it('does not treat the scheduled delivery window as kitchen ready time', () => {
    const payload = fixture('detail-scheduled');
    const order = payload.order as Record<string, unknown>;
    delete order.preparation_time;

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
