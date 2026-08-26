export const ORDER_LIFECYCLE_OUTBOX_SOURCE = 'orders.lifecycle';
export const ORDER_ACCEPTED_LIFECYCLE_EVENT = 'order.accepted';
export const ORDER_PREP_STARTED_LIFECYCLE_EVENT = 'order.prep_started';

export const orderAcceptedIdempotencyKey = (orderStableId: string): string =>
  `order.accepted:${orderStableId}`;

export const orderPrepStartedIdempotencyKey = (orderStableId: string): string =>
  `order.prep_started:${orderStableId}`;
