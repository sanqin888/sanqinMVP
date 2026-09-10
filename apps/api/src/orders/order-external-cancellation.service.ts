import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

import type {
  OrderExternalCancellationFinalizerPort,
  OrderExternalCancellationInput,
  OrderExternalCancellationResult,
} from './order-external-cancellation.contract';
import {
  ORDER_CANCELLED_LIFECYCLE_EVENT,
  ORDER_LIFECYCLE_OUTBOX_SOURCE,
  orderCancelledIdempotencyKey,
} from './order-lifecycle';
import { PrismaService } from './orders-prisma';

@Injectable()
export class OrderExternalCancellationFinalizerService implements OrderExternalCancellationFinalizerPort {
  constructor(private readonly prisma: PrismaService) {}

  async finalizeConfirmedCancellation(
    input: OrderExternalCancellationInput,
  ): Promise<OrderExternalCancellationResult> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          orderStableId: input.orderStableId,
          channel: input.channel,
          clientRequestId: `${input.channel}:${input.externalOrderId}`,
        },
        select: {
          id: true,
          orderStableId: true,
          totalCents: true,
          paymentMethod: true,
        },
      });
      if (!order) {
        throw new Error(
          `External order disappeared before cancellation: ${input.externalOrderId}`,
        );
      }

      const reason = input.reason.trim() || 'External cancellation confirmed';
      const refundCents = Math.max(0, order.totalCents);
      const amendmentStableId = this.amendmentStableId(
        input.channel,
        input.externalEventId,
      );

      await tx.orderAmendment.upsert({
        where: { amendmentStableId },
        create: {
          amendmentStableId,
          orderId: order.id,
          type: 'RETENDER',
          paymentMethod: order.paymentMethod,
          reason,
          deltaCents: -refundCents,
          refundCents,
          summaryJson: {
            kind: 'EXTERNAL_CANCELLATION',
            status: 'CONFIRMED',
            channel: input.channel,
            eventId: input.externalEventId,
            externalOrderId: input.externalOrderId,
            occurredAt: input.occurredAt,
          },
        },
        update: {},
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'refunded' },
      });
      await tx.opsEvent.createMany({
        data: {
          idempotencyKey: orderCancelledIdempotencyKey(order.orderStableId),
          eventName: ORDER_CANCELLED_LIFECYCLE_EVENT,
          source: ORDER_LIFECYCLE_OUTBOX_SOURCE,
          payload: {
            orderStableId: order.orderStableId,
            reason,
            operatorName: input.operatorName,
          },
        },
        skipDuplicates: true,
      });

      return { orderStableId: order.orderStableId, refundCents };
    });
  }

  private amendmentStableId(channel: string, externalEventId: string): string {
    const digest = createHash('sha256')
      .update(`${channel}:${externalEventId}`)
      .digest('hex');
    return `external_cancel_${digest}`;
  }
}
