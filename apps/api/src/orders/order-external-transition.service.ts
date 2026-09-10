import { Injectable } from '@nestjs/common';

import type {
  OrderExternalTransitionCoordinatorPort,
  OrderExternalTransitionTransaction,
} from './order-external-transition.contract';
import {
  ORDER_ACCEPTED_LIFECYCLE_EVENT,
  ORDER_LIFECYCLE_OUTBOX_SOURCE,
  orderAcceptedIdempotencyKey,
} from './order-lifecycle';
import { PrismaService } from './orders-prisma';

@Injectable()
export class OrderExternalTransitionCoordinatorService implements OrderExternalTransitionCoordinatorPort {
  constructor(private readonly prisma: PrismaService) {}

  async completeProviderConfirmedTransition(
    input: Parameters<
      OrderExternalTransitionCoordinatorPort['completeProviderConfirmedTransition']
    >[0],
    withinTransaction: Parameters<
      OrderExternalTransitionCoordinatorPort['completeProviderConfirmedTransition']
    >[1],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const completion = await withinTransaction(
        tx as unknown as OrderExternalTransitionTransaction,
      );
      if (!completion) return false;
      if (!input.transition) return true;

      const order = await tx.order.findUnique({
        where: {
          clientRequestId: `${input.channel}:${completion.externalOrderId}`,
        },
        select: { id: true, orderStableId: true, status: true },
      });
      let reachedTarget = order?.status === input.transition.to;

      if (order?.status === input.transition.from) {
        const transition = await tx.order.updateMany({
          where: {
            id: order.id,
            status: input.transition.from,
          },
          data: {
            status: input.transition.to,
            makingAt:
              input.transition.to === 'making'
                ? completion.completedAt
                : undefined,
            readyAt:
              input.transition.to === 'ready'
                ? completion.completedAt
                : undefined,
          },
        });
        reachedTarget = transition.count === 1;
        if (!reachedTarget) {
          const current = await tx.order.findUnique({
            where: { id: order.id },
            select: { status: true },
          });
          reachedTarget = current?.status === input.transition.to;
        }
      }

      if (order && reachedTarget && completion.acceptanceConfirmed) {
        await tx.opsEvent.createMany({
          data: {
            idempotencyKey: orderAcceptedIdempotencyKey(order.orderStableId),
            eventName: ORDER_ACCEPTED_LIFECYCLE_EVENT,
            source: ORDER_LIFECYCLE_OUTBOX_SOURCE,
            payload: { orderStableId: order.orderStableId },
          },
          skipDuplicates: true,
        });
      }

      return true;
    });
  }
}
