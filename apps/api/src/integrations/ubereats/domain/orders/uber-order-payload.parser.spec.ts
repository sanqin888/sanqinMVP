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

  it('maps a real-shaped immediate Get Order response without field guessing', () => {
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
    expect(order?.specialInstructions).toBe('Fixture order note');
    expect(order?.allergyRequest).toEqual({
      hasRequest: true,
      allergens: ['PEANUTS', 'SOY'],
    });
    expect(order?.items[0]).toMatchObject({
      baseUnitPriceCents: 800,
      optionsUnitPriceCents: 200,
      unitPriceCents: 1000,
      lineTotalCents: 1000,
      specialInstructions:
        'Fixture item note\nALLERGY: PEANUTS, SOY\nALLERGY INSTRUCTIONS: Use a clean surface\nOPTION REQUEST (Fixture Option):\nCook option separately',
    });
    expect(order?.items[0]?.modifiers[0]).toMatchObject({
      externalId: 'sanq:option-1',
      parentExternalId: 'modifier-group-1',
      priceDeltaCents: 200,
      specialInstructions: 'Cook option separately',
    });
  });

  it.each([
    [true, 'Fixture order note\n餐具 / Utensils: 是 / Yes'],
    [false, 'Fixture order note\n餐具 / Utensils: 否 / No'],
  ])(
    'relays Uber single-use-items choice into bilingual order notes',
    (requested, expected) => {
      const payload = fixture('detail-modifiers.json') as {
        order: { carts: Array<{ include_single_use_items?: boolean }> };
      };
      payload.order.carts[0].include_single_use_items = requested;

      const order = parser.parse(payload, {
        eventType: 'orders.notification',
      });
      expect(order?.specialInstructions).toBe(expected);
    },
  );

  it('rejects a malformed single-use-items request instead of silently dropping it', () => {
    const payload = fixture('detail-modifiers.json') as {
      order: { carts: Array<{ include_single_use_items?: unknown }> };
    };
    payload.order.carts[0].include_single_use_items = 2;

    expect(
      parser.parseResult(payload, { eventType: 'orders.notification' }),
    ).toEqual({
      kind: 'invalid',
      reason: 'UNRELAYABLE_CUSTOMER_REQUEST',
      category: 'business',
    });
  });

  it('treats an empty Uber allergy placeholder as no allergy request', () => {
    const payload = fixture('detail-modifiers.json') as {
      order: {
        carts: Array<{
          items: Array<{
            customer_request: {
              allergy: { allergens?: unknown; instructions?: unknown };
            };
          }>;
        }>;
      };
    };
    payload.order.carts[0].items[0].customer_request.allergy = {
      allergens: [],
      instructions: '',
    };

    const order = parser.parse(payload, { eventType: 'orders.notification' });
    expect(order?.allergyRequest).toEqual({
      hasRequest: false,
      allergens: [],
    });
    expect(order?.items[0]?.specialInstructions).toBe(
      'Fixture item note\nOPTION REQUEST (Fixture Option):\nCook option separately',
    );
  });

  it('collects structured allergens recursively from modifier requests', () => {
    const payload = fixture('detail-modifiers.json') as {
      order: {
        carts: Array<{
          items: Array<{
            selected_modifier_groups: Array<{
              selected_items: Array<{
                customer_request: Record<string, unknown>;
              }>;
            }>;
          }>;
        }>;
      };
    };
    const modifier =
      payload.order.carts[0].items[0].selected_modifier_groups[0]
        .selected_items[0];
    modifier.customer_request.allergy = {
      allergens: ['SHELLFISH'],
      instructions: 'Separate prep area',
    };

    const order = parser.parse(payload, { eventType: 'orders.notification' });
    expect(order?.allergyRequest).toEqual({
      hasRequest: true,
      allergens: ['PEANUTS', 'SOY', 'SHELLFISH'],
    });
  });

  it('rejects a malformed order-level special instruction instead of dropping it', () => {
    const payload = fixture('detail-modifiers.json') as {
      order: { carts: Array<{ special_instructions?: unknown }> };
    };
    payload.order.carts[0].special_instructions = 42;

    expect(
      parser.parseResult(payload, { eventType: 'orders.notification' }),
    ).toEqual({
      kind: 'invalid',
      reason: 'UNRELAYABLE_CUSTOMER_REQUEST',
      category: 'business',
    });
  });

  it('rejects an allergy request that cannot be fully relayed', () => {
    const payload = fixture('detail-modifiers.json') as {
      order: {
        carts: Array<{
          items: Array<{
            customer_request: { allergy: Record<string, unknown> };
          }>;
        }>;
      };
    };
    payload.order.carts[0].items[0].customer_request.allergy.instructions = 42;

    expect(
      parser.parseResult(payload, { eventType: 'orders.notification' }),
    ).toEqual({
      kind: 'invalid',
      reason: 'UNRELAYABLE_CUSTOMER_REQUEST',
      category: 'business',
    });
  });

  it('rejects an unknown customer-request field instead of guessing its semantics', () => {
    const payload = fixture('detail-modifiers.json') as {
      order: {
        carts: Array<{
          items: Array<{ customer_request: Record<string, unknown> }>;
        }>;
      };
    };
    payload.order.carts[0].items[0].customer_request.future_request =
      'must not be silently ignored';

    expect(
      parser.parseResult(payload, { eventType: 'orders.notification' }),
    ).toEqual({
      kind: 'invalid',
      reason: 'UNRELAYABLE_CUSTOMER_REQUEST',
      category: 'business',
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

  it('derives fulfillment timing from the webhook contract, not detail status guessing', () => {
    const order = parser.parse(fixture('detail-scheduled.json'), {
      eventType: 'orders.notification',
    });
    expect(order?.fulfillmentTiming).toBe('IMMEDIATE');
    expect(order?.scheduledReadyAt).toBeNull();
  });

  it('rejects a bare MerchantOrder without the official Get Order envelope', () => {
    const response = fixture('detail.json') as { order?: unknown };
    expect(
      parser.parseResult(response.order, {
        eventType: 'orders.notification',
      }),
    ).toEqual({
      kind: 'invalid',
      reason: 'MALFORMED_PAYLOAD',
      category: 'mapping',
    });
  });

  it('rejects a payload that is not the 1.0.0 Get Order contract', () => {
    expect(
      parser.parseResult(
        { id: 'not-a-v1-get-order-response' },
        { eventType: 'orders.notification' },
      ),
    ).toEqual({
      kind: 'invalid',
      reason: 'MALFORMED_PAYLOAD',
      category: 'mapping',
    });
  });
});
