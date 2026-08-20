import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  UberOrderPayloadParser,
  validateUberOrderAmounts,
} from './uber-order-payload.parser';

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      join(__dirname, '../../test/fixtures/uber-contract/v1/orders', name),
      'utf8',
    ),
  ) as unknown;

describe('UberOrderPayloadParser Order Fulfillment 1.0.0', () => {
  const parser = new UberOrderPayloadParser();

  it('maps a real-shaped immediate MerchantOrder without field guessing', () => {
    const order = parser.parse(fixture('detail.json'), {
      eventType: 'orders.notification',
    });
    expect(order).toMatchObject({
      externalOrderId: 'fixture-order-immediate',
      subtotalCents: 1000,
      discountCents: 0,
      taxCents: 130,
      totalCents: 1130,
      fulfillmentTiming: 'IMMEDIATE',
      scheduledReadyAt: null,
    });
    expect(order?.items[0]).toMatchObject({
      externalItemId: 'sanq:item-1',
      externalLineId: 'cart-line-1',
      baseUnitPriceCents: 1000,
      optionsUnitPriceCents: 0,
      unitPriceCents: 1000,
      lineTotalCents: 1000,
    });
    expect(validateUberOrderAmounts(order!)).toMatchObject({
      totalVarianceCents: 0,
      hasMaterialVariance: false,
    });
  });

  it('joins modifiers to payment price rows by cart_item_id', () => {
    const order = parser.parse(fixture('detail-modifiers.json'), {
      eventType: 'orders.notification',
    });
    expect(order?.items[0]).toMatchObject({
      baseUnitPriceCents: 800,
      optionsUnitPriceCents: 200,
      unitPriceCents: 1000,
      lineTotalCents: 1000,
      specialInstructions: 'Fixture item note',
    });
    expect(order?.items[0]?.modifiers[0]).toMatchObject({
      externalId: 'sanq:option-1',
      parentExternalId: 'modifier-group-1',
      priceDeltaCents: 200,
    });
  });

  it('maps item promotion totals without changing original item lines', () => {
    const order = parser.parse(fixture('detail-promotion.json'), {
      eventType: 'orders.notification',
    });
    expect(order).toMatchObject({
      subtotalCents: 1500,
      discountCents: 300,
      taxCents: 156,
      totalCents: 1356,
      hasPromotion: true,
    });
    expect(validateUberOrderAmounts(order!)).toMatchObject({
      totalVarianceCents: 0,
      hasMaterialVariance: false,
    });
  });

  it('uses preparation_time.ready_for_pickup_time for scheduledReadyAt', () => {
    const order = parser.parse(fixture('detail-scheduled.json'), {
      eventType: 'orders.scheduled.notification',
    });
    expect(order?.fulfillmentTiming).toBe('SCHEDULED');
    expect(order?.scheduledReadyAt?.toISOString()).toBe(
      '2026-08-22T17:30:00.000Z',
    );
    expect(order?.scheduledReadyAt?.toISOString()).not.toBe(
      '2026-08-22T18:00:00.000Z',
    );
  });

  it('rejects a payload that is not the 1.0.0 MerchantOrder contract', () => {
    expect(
      parser.parseResult(
        { id: 'not-a-v1-merchant-order' },
        { eventType: 'orders.notification' },
      ),
    ).toEqual({
      kind: 'invalid',
      reason: 'MALFORMED_PAYLOAD',
      category: 'mapping',
    });
  });
});
