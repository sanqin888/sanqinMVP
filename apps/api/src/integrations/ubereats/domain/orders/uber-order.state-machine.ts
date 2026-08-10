import { createHash } from 'crypto';
import { normalizeUberEventType } from '../shared/uber-integration.utils';
import { UberOrderActionNotAllowedError } from './uber-order.errors';
import {
  UberOrderStatus,
  type ParsedUberOrder,
  type UberOrderActionName,
} from './uber-order.types';

const canRequestOrderAction = (
  status: UberOrderStatus,
  action: UberOrderActionName,
): boolean => {
  if (action === 'ACCEPT' || action === 'DENY')
    return (
      status === UberOrderStatus.pending || status === UberOrderStatus.paid
    );
  return status === UberOrderStatus.paid || status === UberOrderStatus.making;
};

/** Pure decisions for the Uber order lifecycle. No caller may assign an arbitrary status. */
export const UberOrderStateMachine = {
  eventStatus(eventType: string): UberOrderStatus | null {
    const event = normalizeUberEventType(eventType);
    if (event.includes('cancel') || event.includes('reject')) return null;
    if (event.includes('complete')) return UberOrderStatus.completed;
    if (event.includes('ready')) return UberOrderStatus.ready;
    if (event.includes('progress') || event.includes('making'))
      return UberOrderStatus.making;
    if (event.includes('accept')) return UberOrderStatus.paid;
    return UberOrderStatus.pending;
  },

  validateAmounts(order: ParsedUberOrder) {
    const calculatedLinesCents = order.items.reduce(
      (sum, item) => sum + item.lineTotalCents,
      0,
    );
    const calculatedTotalCents =
      order.subtotalCents -
      order.discountCents +
      order.taxCents +
      order.deliveryFeeCents;
    const lineVarianceCents = order.subtotalCents - calculatedLinesCents;
    const totalVarianceCents = order.totalCents - calculatedTotalCents;
    const roundingToleranceCents = Math.max(1, order.items.length);
    return {
      calculatedLinesCents,
      calculatedTotalCents,
      lineVarianceCents,
      totalVarianceCents,
      roundingToleranceCents,
      hasMaterialVariance:
        Math.abs(lineVarianceCents) > roundingToleranceCents ||
        Math.abs(totalVarianceCents) > roundingToleranceCents,
    };
  },

  canRequestAction(
    status: UberOrderStatus,
    action: UberOrderActionName,
  ): boolean {
    return canRequestOrderAction(status, action);
  },

  assertCanRequestAction(status: UberOrderStatus, action: UberOrderActionName) {
    if (!canRequestOrderAction(status, action))
      throw new UberOrderActionNotAllowedError(status, action);
  },

  afterConfirmedAction(
    status: UberOrderStatus,
    action: UberOrderActionName,
  ): UberOrderStatus | null {
    if (action === 'ACCEPT' && status === UberOrderStatus.pending)
      return UberOrderStatus.making;
    if (
      action === 'READY_FOR_PICKUP' &&
      (status === UberOrderStatus.paid || status === UberOrderStatus.making)
    )
      return UberOrderStatus.ready;
    return null;
  },

  afterCancellation(status: UberOrderStatus): UberOrderStatus | null {
    const cancellable: UberOrderStatus[] = [
      UberOrderStatus.pending,
      UberOrderStatus.paid,
      UberOrderStatus.making,
    ];
    return cancellable.includes(status) ? UberOrderStatus.refunded : null;
  },

  idempotencyKey(externalOrderId: string, action: UberOrderActionName): string {
    return `sanqin-uber-${createHash('sha256')
      .update(`${externalOrderId.trim()}\0${action}`)
      .digest('hex')}`;
  },
} as const;
