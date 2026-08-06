import { Injectable } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import {
  ORDER_STATUS_ADVANCE_FLOW,
  type OrderStatus,
} from '../orders/order-status';
import type { OrderDto } from '../orders/dto/order.dto';
import { UberEatsService } from '../integrations/ubereats/ubereats.service';

const UBER_EATS_CLIENT_REQUEST_PREFIX = 'ubereats:';

@Injectable()
export class PosOrdersService {
  constructor(
    private readonly orders: OrdersService,
    private readonly uberEats: UberEatsService,
  ) {}

  async advance(orderStableId: string): Promise<OrderDto> {
    const order = await this.orders.getByStableId(orderStableId);
    const nextStatus = ORDER_STATUS_ADVANCE_FLOW[order.status];
    const externalOrderId = this.getUberWebhookExternalOrderId(order);

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
