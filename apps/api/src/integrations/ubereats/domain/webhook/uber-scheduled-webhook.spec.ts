import {
  dispatchUberWebhookV1,
  parseUberOrderCancelV1,
  parseUberOrderNotificationV1,
} from './uber-webhook-event.parser';

const scheduledNotification = {
  event_type: 'orders.scheduled.notification',
  resource_href: 'https://api.uber.com/v1/delivery/order/order-1',
  event_id: 'event-1',
  event_time: 1_787_197_669_000,
  meta: {
    resource_id: 'order-1',
    user_id: 'store-1',
  },
};

const v1Failure = {
  event_type: 'orders.failure',
  resource_href: 'https://api.uber.com/v1/delivery/order/order-1',
  event_id: 'event-2',
  event_time: 1_787_227_747,
  meta: {
    resource_id: 'order-1',
    user_id: 'store-1',
  },
};

describe('Uber scheduled webhook routing', () => {
  it('recognizes orders.scheduled.notification as an order notification', () => {
    const event = parseUberOrderNotificationV1(scheduledNotification);
    expect(event?.family).toBe('order');
    expect(event?.eventType).toBe('orders.scheduled.notification');
    expect(event?.resourceId).toBe('order-1');
  });

  it('dispatches scheduled notifications through the existing order import path', () => {
    const result = dispatchUberWebhookV1({
      eventType: 'orders.scheduled.notification',
      businessVersion: 'v1',
      payload: scheduledNotification,
    });

    expect(result.kind).toBe('order');
    if (result.kind !== 'order') throw new Error('expected order dispatch');
    expect(result.event.family).toBe('order');
    expect(result.ordering.occurredAt).toEqual(
      new Date('2026-08-20T03:47:49.000Z'),
    );
  });

  it('routes v1 orders.failure as cancellation instead of unsupported', () => {
    expect(parseUberOrderCancelV1(v1Failure)?.family).toBe('order-cancel');

    const result = dispatchUberWebhookV1({
      eventType: 'orders.failure',
      businessVersion: 'v1',
      payload: v1Failure,
    });

    expect(result.kind).toBe('order-cancel');
    if (result.kind !== 'order-cancel')
      throw new Error('expected order cancellation dispatch');
    expect(result.event.resourceId).toBe('order-1');
    expect(result.ordering.occurredAt).toEqual(
      new Date('2026-08-20T12:09:07.000Z'),
    );
  });
});
