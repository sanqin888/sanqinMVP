import { parseUberMenuNotificationV1 } from './uber-menu-notification.v1';
import { parseUberOrderNotificationV1 } from './uber-order-notification.v1';
import { parseUberWebhookEnvelopeV1 } from './uber-webhook-envelope.v1';

const envelope = {
  event_type: 'orders.notification',
  event_id: 'evt-1',
  resource_href: 'https://api.uber.com/v1/eats/orders/order-1',
  meta: { resource_id: 'order-1', user_id: 'store-1' },
};

describe('Uber events v1 contract', () => {
  it('normalizes the external envelope without leaking snake_case DTO fields', () => {
    expect(parseUberWebhookEnvelopeV1(envelope)).toEqual({
      version: 1,
      eventType: 'orders.notification',
      eventId: 'evt-1',
      resourceHref: envelope.resource_href,
      resourceId: 'order-1',
      userId: 'store-1',
    });
  });

  it('rejects a payload with a required field missing', () => {
    expect(
      parseUberWebhookEnvelopeV1({ ...envelope, resource_href: undefined }),
    ).toBeNull();
  });

  it('keeps unknown event types as envelopes but excludes them from order events', () => {
    const unknown = { ...envelope, event_type: 'future.resource.changed' };
    expect(parseUberWebhookEnvelopeV1(unknown)?.eventType).toBe(
      'future.resource.changed',
    );
    expect(parseUberOrderNotificationV1(unknown)).toBeNull();
  });

  it('parses duplicate deliveries to the same stable event identity', () => {
    const first = parseUberOrderNotificationV1(envelope);
    const duplicate = parseUberOrderNotificationV1({ ...envelope });
    expect(duplicate?.eventId).toBe(first?.eventId);
    expect(duplicate).toEqual(first);
  });

  it('accepts old envelope id and ignores additive fields for compatibility', () => {
    const oldPayload = { ...envelope, event_id: undefined, id: 'legacy-1' };
    expect(
      parseUberWebhookEnvelopeV1({ ...oldPayload, added_in_future: true })
        ?.eventId,
    ).toBe('legacy-1');
  });

  it('supports legacy menu correlation and error field locations', () => {
    expect(
      parseUberMenuNotificationV1({
        meta: { user_id: 'store-1', resource_id: 'publication-1' },
        data: {
          status: 'failed',
          errors: [
            { code: 'INVALID', field_path: 'menus[0]', description: 'bad' },
          ],
        },
      }),
    ).toMatchObject({
      version: 1,
      family: 'menu',
      storeId: 'store-1',
      resourceId: 'publication-1',
      status: 'FAILED',
      failures: [{ code: 'INVALID', path: 'menus[0]', message: 'bad' }],
    });
  });
});
