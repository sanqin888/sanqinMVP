export const ORDER_DELIVERY_DISPATCH_SOURCE =
  'orders.delivery_dispatch';

export const ORDER_DELIVERY_DISPATCH_REQUESTED_EVENT =
  'order.delivery_dispatch.requested';
export const ORDER_DELIVERY_DISPATCH_ATTEMPT_STARTED_EVENT =
  'order.delivery_dispatch.attempt_started';
export const ORDER_DELIVERY_DISPATCH_SUCCEEDED_EVENT =
  'order.delivery_dispatch.succeeded';
export const ORDER_DELIVERY_DISPATCH_FAILED_EVENT =
  'order.delivery_dispatch.failed';
export const ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT =
  'order.delivery_dispatch.unknown';
export const ORDER_DELIVERY_DISPATCH_RECONCILED_EVENT =
  'order.delivery_dispatch.reconciled';

export const ORDER_DELIVERY_DISPATCH_TERMINAL_EVENTS = [
  ORDER_DELIVERY_DISPATCH_SUCCEEDED_EVENT,
  ORDER_DELIVERY_DISPATCH_FAILED_EVENT,
  ORDER_DELIVERY_DISPATCH_UNKNOWN_EVENT,
] as const;

export type OrderDeliveryDispatchTerminalEvent =
  (typeof ORDER_DELIVERY_DISPATCH_TERMINAL_EVENTS)[number];

export type OrderDeliveryDispatchReconciliationAction =
  | 'BIND_EXISTING'
  | 'CONFIRM_NOT_CREATED_RETRY';

export const orderDeliveryDispatchRequestedIdempotencyKey = (
  orderStableId: string,
  attempt: number,
): string => `order.delivery_dispatch.requested:${orderStableId}:${attempt}`;

export const orderDeliveryDispatchAttemptStartedIdempotencyKey = (
  orderStableId: string,
  attempt: number,
): string => `order.delivery_dispatch.attempt_started:${orderStableId}:${attempt}`;

export const orderDeliveryDispatchSucceededIdempotencyKey = (
  orderStableId: string,
  attempt: number,
): string => `order.delivery_dispatch.succeeded:${orderStableId}:${attempt}`;

export const orderDeliveryDispatchFailedIdempotencyKey = (
  orderStableId: string,
  attempt: number,
): string => `order.delivery_dispatch.failed:${orderStableId}:${attempt}`;

export const orderDeliveryDispatchUnknownIdempotencyKey = (
  orderStableId: string,
  attempt: number,
): string => `order.delivery_dispatch.unknown:${orderStableId}:${attempt}`;

export const orderDeliveryDispatchReconciledIdempotencyKey = (
  orderStableId: string,
  attempt: number,
): string => `order.delivery_dispatch.reconciled:${orderStableId}:${attempt}`;

export const UBER_DIRECT_AUTOMATIC_RETRY_COUNT = 3;

export function readAutomaticRetryDelayMs(
  automaticRetriesRemaining: number,
): number {
  if (automaticRetriesRemaining >= 3) return 2_000;
  if (automaticRetriesRemaining === 2) return 5_000;
  return 10_000;
}

export function normalizeDeliveryDispatchAttempt(
  value: unknown,
): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export function readDeliveryDispatchStaleAttemptMs(): number {
  const raw = Number(process.env.UBER_DIRECT_DURABLE_STALE_ATTEMPT_MS);
  if (!Number.isFinite(raw) || raw < 60_000) return 120_000;
  return Math.round(raw);
}
