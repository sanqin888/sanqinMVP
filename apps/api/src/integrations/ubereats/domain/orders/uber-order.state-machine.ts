import { OrderStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { normalizeUberEventType } from '../shared/uber-integration.utils';
import type { ParsedUberOrder, UberOrderActionName } from './uber-order.types';

/** Pure decisions for the Uber order lifecycle. No caller may assign an arbitrary status. */
export const UberOrderStateMachine = {
  eventStatus(eventType: string): OrderStatus | null {
    const event = normalizeUberEventType(eventType);
    if (event.includes('cancel') || event.includes('reject')) return null;
    if (event.includes('complete')) return OrderStatus.completed;
    if (event.includes('ready')) return OrderStatus.ready;
    if (event.includes('progress') || event.includes('making'))
      return OrderStatus.making;
    if (event.includes('accept')) return OrderStatus.paid;
    return OrderStatus.pending;
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

  canRequestAction(status: OrderStatus, action: UberOrderActionName): boolean {
    if (action === 'ACCEPT' || action === 'DENY')
      return status === OrderStatus.pending || status === OrderStatus.paid;
    return status === OrderStatus.paid || status === OrderStatus.making;
  },

  afterConfirmedAction(
    status: OrderStatus,
    action: UberOrderActionName,
  ): OrderStatus | null {
    if (action === 'ACCEPT' && status === OrderStatus.pending)
      return OrderStatus.making;
    if (
      action === 'READY_FOR_PICKUP' &&
      (status === OrderStatus.paid || status === OrderStatus.making)
    )
      return OrderStatus.ready;
    return null;
  },

  afterCancellation(status: OrderStatus): OrderStatus | null {
    const cancellable: OrderStatus[] = [
      OrderStatus.pending,
      OrderStatus.paid,
      OrderStatus.making,
    ];
    return cancellable.includes(status) ? OrderStatus.refunded : null;
  },

  idempotencyKey(externalOrderId: string, action: UberOrderActionName): string {
    return `sanqin-uber-${createHash('sha256')
      .update(`${externalOrderId.trim()}\0${action}`)
      .digest('hex')}`;
  },
} as const;
