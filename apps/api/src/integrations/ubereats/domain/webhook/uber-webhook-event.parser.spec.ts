import { readFileSync } from 'fs';
import { join } from 'path';
import {
  dispatchUberWebhookV1,
  parseUberMenuNotificationV1,
  parseUberOrderCancelV1,
  parseUberOrderNotificationV1,
  parseUberStoreProvisioningV1,
  parseUberStoreStatusChangedV1,
} from './uber-webhook-event.parser';
import { parseUberWebhookEnvelopeV1 } from './uber-webhook-envelope';

const envelope = {
  event_type: 'orders.notification',
  event_id: 'evt-1',
  resource_href: 'https://api.uber.com/v1/eats/orders/order-1',
  meta: { resource_id: 'order-1', user_id: 'store-1' },
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJsonObject = (text: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(text);
  if (!isJsonObject(value)) throw new Error('Expected a JSON object fixture');
  return value;
};

describe('Uber webhook event domain parser', () => {
  const fixture = (name: string): Record<string, unknown> =>
    parseJsonObject(
      readFileSync(
        join(
          __dirname,
          '../../test/fixtures/uber-contract/v1/webhooks',
          `${name}.json`,
        ),
        'utf8',
      ),
    );

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

  it('uses a dedicated parser for the official order cancellation shape', () => {
    expect(parseUberOrderCancelV1(fixture('orders.cancel'))).toMatchObject({
      version: 1,
      family: 'order-cancel',
      eventType: 'orders.cancel',
      resourceId: 'order-redacted',
    });
    expect(parseUberOrderNotificationV1(fixture('orders.cancel'))).toBeNull();
  });

  it.each([
    ['store.provisioned', true],
    ['store.deprovisioned', false],
  ] as const)(
    'parses %s as a versioned provisioning contract',
    (name, value) => {
      expect(parseUberStoreProvisioningV1(fixture(name))).toMatchObject({
        version: 1,
        family: 'store-provisioning',
        eventType: name,
        storeId: 'store-redacted',
        provisioned: value,
      });
    },
  );

  it('parses store status independently from provisioning', () => {
    const payload = fixture('store.status.changed');
    expect(parseUberStoreStatusChangedV1(payload)).toMatchObject({
      version: 1,
      family: 'store-status',
      storeId: 'store-redacted',
    });
    expect(parseUberStoreProvisioningV1(payload)).toBeNull();
  });

  it('accepts the versioned lifecycle fixture only as orders.notification', () => {
    expect(
      parseUberOrderNotificationV1(fixture('orders.notification')),
    ).toMatchObject({ family: 'order', eventType: 'orders.notification' });
    expect(
      parseUberOrderNotificationV1({
        ...envelope,
        event_type: 'orders.ready_for_pickup',
      }),
    ).toBeNull();
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

  it.each(['submitted', 'pending', 'succeeded', 'failed'] as const)(
    'normalizes the %s menu notification status in the domain parser',
    (status) => {
      expect(
        parseUberMenuNotificationV1({
          data: {
            store_id: 'store-1',
            resource_id: 'publication-1',
            status,
          },
        })?.status,
      ).toBe(status.toUpperCase());
    },
  );

  it('rejects menu notifications with a status outside the domain lifecycle', () => {
    expect(
      parseUberMenuNotificationV1({
        data: {
          store_id: 'store-1',
          resource_id: 'publication-1',
          status: 'cancelled',
        },
      }),
    ).toBeNull();
  });

  it('rejects unknown business versions before interpreting the payload', () => {
    expect(
      dispatchUberWebhookV1({
        eventType: 'orders.notification',
        businessVersion: 'v2',
        payload: envelope,
      }),
    ).toEqual({ kind: 'unsupported', reason: 'version' });
  });

  it('returns invalid for a supported event with required fields missing', () => {
    expect(
      dispatchUberWebhookV1({
        eventType: 'orders.notification',
        businessVersion: 'v1',
        payload: { ...envelope, resource_href: undefined },
      }),
    ).toEqual({ kind: 'invalid' });
  });

  it('returns unsupported without parsing unknown event workflows', () => {
    expect(
      dispatchUberWebhookV1({
        eventType: 'orders.future',
        businessVersion: 'v1',
        payload: envelope,
      }),
    ).toEqual({ kind: 'unsupported', reason: 'event' });
  });
});
