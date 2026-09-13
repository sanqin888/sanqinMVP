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
import {
  appendOrderFinancialChangeFact,
  buildOrderFinancialReversalFact,
} from './order-financial-change-fact';
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
          storeId: true,
          channel: true,
          paymentMethod: true,
          subtotalCents: true,
          subtotalAfterDiscountCents: true,
          taxCents: true,
          deliveryFeeCents: true,
          creditCardSurchargeCents: true,
          totalCents: true,
          paymentTotalCents: true,
          items: {
            select: {
              qty: true,
              isDailySpecialApplied: true,
            },
          },
        },
      });
      if (!order) {
        throw new Error(
          `External order disappeared before cancellation: ${input.externalOrderId}`,
        );
      }

      const reason = input.reason.trim() || 'External cancellation confirmed';
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : null;
      if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
        throw new Error(
          `External cancellation is missing authoritative occurredAt: ${input.externalEventId}`,
        );
      }
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
      await appendOrderFinancialChangeFact(
        tx,
        buildOrderFinancialReversalFact({
          factStableId: amendmentStableId,
          occurredAt,
          action: 'EXTERNAL_CANCELLATION',
          occurrenceEvidence: 'PROVIDER_EVENT',
          before: order,
          declaredPaymentMethod: order.paymentMethod,
          refundGrossCents: refundCents,
        }),
      );
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
