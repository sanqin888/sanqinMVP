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
    expect(parseUberOrderNotificationV1(scheduledNotification)).toEqual(
      expect.objectContaining({
        family: 'order',
        eventType: 'orders.scheduled.notification',
        resourceId: 'order-1',
      }),
    );
  });

  it('dispatches scheduled notifications through the existing order import path', () => {
    expect(
      dispatchUberWebhookV1({
        eventType: 'orders.scheduled.notification',
        businessVersion: 'v1',
        payload: scheduledNotification,
      }),
    ).toEqual(
      expect.objectContaining({
        kind: 'order',
        event: expect.objectContaining({ family: 'order' }),
      }),
    );
  });
});
