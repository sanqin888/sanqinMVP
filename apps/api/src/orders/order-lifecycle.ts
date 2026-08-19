export const ORDER_LIFECYCLE_OUTBOX_SOURCE = 'orders.lifecycle';
export const ORDER_ACCEPTED_LIFECYCLE_EVENT = 'order.accepted';
export const ORDER_PREP_STARTED_LIFECYCLE_EVENT = 'order.prep_started';

export const orderAcceptedIdempotencyKey = (orderId: string): string =>
  `order.accepted:${orderId}`;

export const orderPrepStartedIdempotencyKey = (orderId: string): string =>
  `order.prep_started:${orderId}`;
