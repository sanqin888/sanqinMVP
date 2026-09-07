export const ORDER_LIFECYCLE_OUTBOX_SOURCE = 'orders.lifecycle';
export const ORDER_ACCEPTED_LIFECYCLE_EVENT = 'order.accepted';
export const ORDER_PREP_STARTED_LIFECYCLE_EVENT = 'order.prep_started';
export const ORDER_INITIAL_PRINT_HANDOFF_LIFECYCLE_EVENT =
  'order.initial_print_handoff';
export const ORDER_CANCELLED_LIFECYCLE_EVENT = 'order.cancelled';
export const ORDER_CANCELLATION_PRINT_HANDOFF_LIFECYCLE_EVENT =
  'order.cancellation_print_handoff';

export const orderAcceptedIdempotencyKey = (orderStableId: string): string =>
  `order.accepted:${orderStableId}`;

export const orderPrepStartedIdempotencyKey = (orderStableId: string): string =>
  `order.prep_started:${orderStableId}`;

export const orderInitialPrintHandoffIdempotencyKey = (
  orderStableId: string,
): string => `order.initial_print_handoff:${orderStableId}`;

export const orderCancelledIdempotencyKey = (orderStableId: string): string =>
  `order.cancelled:${orderStableId}`;

export const orderCancellationPrintHandoffIdempotencyKey = (
  orderStableId: string,
): string => `order.cancellation_print_handoff:${orderStableId}`;
