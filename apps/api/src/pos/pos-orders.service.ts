import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  Channel,
  OrderAmendmentType,
  OrderStatus as PrismaOrderStatus,
  PaymentMethod,
} from '@prisma/client';
import { OrdersService } from '../orders/orders.service';
import {
  ORDER_STATUS_ADVANCE_FLOW,
  type OrderStatus,
} from '../orders/order-status';
import type { OrderDto } from '../orders/dto/order.dto';
import { UberEatsService } from '../integrations/ubereats/ubereats.service';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';

const UBER_EATS_CLIENT_REQUEST_PREFIX = 'ubereats:';

@Injectable()
export class PosOrdersService {
  constructor(
    private readonly orders: OrdersService,
    private readonly uberEats: UberEatsService,
    private readonly prisma: PrismaService,
  ) {}

  async advance(orderStableId: string): Promise<OrderDto> {
    const order = await this.orders.getByStableId(orderStableId);
    const nextStatus = ORDER_STATUS_ADVANCE_FLOW[order.status];
    const externalOrderId = this.getUberWebhookExternalOrderId(order);

    if (order.status === 'pending' && externalOrderId) {
      const result = await this.uberEats.acceptUberOrder(externalOrderId);

      // ACCEPT owns both the durable outbox action and the atomic pending/paid
      // -> making transition. Never run the generic pending -> paid path.
      if (!result.ok) return order;
      return this.orders.getByStableId(orderStableId);
    }

    if (nextStatus === 'ready' && externalOrderId) {
      const result = await this.uberEats.syncOrderStatusToUber(
        externalOrderId,
        'ready' satisfies OrderStatus,
      );

      // syncOrderStatusToUber owns the atomic local transition and durable
      // Uber action outbox. Read the committed order rather than advancing it
      // separately, which could otherwise lose the retryable action on failure.
      if (!result.ok) return order;
      return this.orders.getByStableId(orderStableId);
    }

    // Uber does not document a merchant "complete" order action. In
    // particular, ready -> completed remains local-only; all ordinary orders
    // and other transitions continue through the existing local state flow.
    return this.orders.advance(orderStableId);
  }

  /** Records the local financial result only after staff handled it in Uber. */
  async recordManualUberRefund(
    orderStableId: string,
    input: { reason: string; evidence: string },
  ): Promise<OrderDto> {
    const reason = input.reason?.trim();
    const evidence = input.evidence?.trim();
    if (!reason) throw new BadRequestException('reason is required');
    if (!evidence) throw new BadRequestException('manual evidence is required');

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { orderStableId } });
      if (!order) throw new BadRequestException('order not found');
      if (order.channel !== Channel.ubereats) {
        throw new BadRequestException(
          'manual Uber refund requires an Uber order',
        );
      }
      if (order.status === PrismaOrderStatus.pending) {
        throw new BadRequestException(
          'order must be accepted before cancellation',
        );
      }
      if (order.status === PrismaOrderStatus.refunded) {
        throw new ConflictException('order is already refunded');
      }
      const amendmentStableId = `uber_manual_${createHash('sha256')
        .update(`${order.id}:${evidence}`)
        .digest('hex')}`;
      await tx.orderAmendment.upsert({
        where: { amendmentStableId },
        create: {
          amendmentStableId,
          orderId: order.id,
          type: OrderAmendmentType.RETENDER,
          paymentMethod: PaymentMethod.UBEREATS,
          reason,
          deltaCents: -order.totalCents,
          refundCents: order.totalCents,
          summaryJson: {
            kind: 'UBER_MANUAL_REFUND',
            status: 'CONFIRMED',
            evidence,
          },
        },
        update: {},
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: PrismaOrderStatus.refunded },
      });
    });
    return this.orders.getByStableId(orderStableId);
  }

  private getUberWebhookExternalOrderId(order: OrderDto): string | null {
    if (order.channel !== 'ubereats') return null;
    if (!order.clientRequestId?.startsWith(UBER_EATS_CLIENT_REQUEST_PREFIX)) {
      return null;
    }

    const externalOrderId = order.clientRequestId
      .slice(UBER_EATS_CLIENT_REQUEST_PREFIX.length)
      .trim();
    return externalOrderId || null;
  }
}
