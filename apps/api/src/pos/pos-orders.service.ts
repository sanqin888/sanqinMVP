import { ConflictException, Injectable } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import {
  ORDER_STATUS_ADVANCE_FLOW,
  type OrderStatus,
} from '../orders/order-status';
import type { OrderDto } from '../orders/dto/order.dto';
import { UberEatsService } from '../integrations/ubereats/ubereats.service';
import { PrismaService } from '../prisma/prisma.service';

const UBER_EATS_CLIENT_REQUEST_PREFIX = 'ubereats:';

@Injectable()
export class PosOrdersService {
  constructor(
    private readonly orders: OrdersService,
    private readonly uberEats: UberEatsService,
    private readonly prisma: PrismaService,
  ) {}

  async cancelUberOrder(
    orderStableId: string,
    reasonCode: string,
    reasonDetail: string,
  ): Promise<{
    ok: boolean;
    outcome: 'confirmed' | 'queued';
    duplicate: boolean;
  }> {
    const order = await this.orders.getByStableId(orderStableId);
    const externalOrderId = this.getUberWebhookExternalOrderId(order);
    if (!externalOrderId) {
      throw new ConflictException({
        code: 'NOT_UBER_ORDER',
        message: '该接口仅用于由 Uber webhook 创建的订单',
      });
    }

    const [acceptAction, denyAction] = await Promise.all([
      this.prisma.uberOrderAction.findUnique({
        where: {
          externalOrderId_action: { externalOrderId, action: 'ACCEPT' },
        },
        select: { status: true },
      }),
      this.prisma.uberOrderAction.findUnique({
        where: { externalOrderId_action: { externalOrderId, action: 'DENY' } },
        select: { status: true, retryable: true },
      }),
    ]);

    // A prior DENY always wins this decision race and is safely replayed via
    // the integration service's (externalOrderId, DENY) idempotency key.
    if (!denyAction && (acceptAction || order.status !== 'pending')) {
      throw new ConflictException({
        code: 'UBER_ACCEPTED_CANCELLATION_UNSUPPORTED',
        message:
          '该 Uber 订单已接单；当前商户权限/API 不支持接单后直接取消或退款，请联系 Uber 支持人工处理。订单本地状态未更改。',
        manualActionRequired: true,
      });
    }

    try {
      const result = await this.uberEats.denyUberOrder(
        externalOrderId,
        reasonCode,
        reasonDetail,
      );
      return {
        ok: true,
        outcome: result.ok ? 'confirmed' : 'queued',
        duplicate: result.duplicate,
      };
    } catch (error) {
      const queued = await this.prisma.uberOrderAction.findUnique({
        where: { externalOrderId_action: { externalOrderId, action: 'DENY' } },
        select: { status: true, retryable: true },
      });
      if (queued?.status === 'FAILED' && queued.retryable) {
        return { ok: true, outcome: 'queued', duplicate: false };
      }
      throw error;
    }
  }

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
