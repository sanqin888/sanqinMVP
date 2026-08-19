import {
  dispatchUberWebhookV1,
  parseUberOrderNotificationV1,
} from './uber-webhook-event.parser';

const scheduledNotification = {
  event_type: 'orders.scheduled.notification',
  resource_href: 'https://api.uber.com/v1/delivery/order/order-1',
  event_id: 'event-1',
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
  });
});
