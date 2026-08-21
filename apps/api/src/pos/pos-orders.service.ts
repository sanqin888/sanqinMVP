import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Channel,
  OrderAmendmentItemAction,
  OrderAmendmentType,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { OrdersService } from '../orders/orders.service';
import {
  ORDER_STATUS_ADVANCE_FLOW,
  type OrderStatus,
} from '../orders/order-status';
import type { OrderDto } from '../orders/dto/order.dto';
import {
  UBER_EATS_ORDER_ACTIONS,
  UBER_EATS_ORDER_STATUS_SYNC,
  type UberEatsOrderActionsPort,
  type UberEatsOrderStatusSyncPort,
} from '../integrations/ubereats/public-api';
import { PrismaService } from '../prisma/prisma.service';

const UBER_EATS_CLIENT_REQUEST_PREFIX = 'ubereats:';
const POS_OPERATOR_REASON_MARKER = ' · 操作人:';
const AMENDABLE_STATUSES = new Set<OrderStatus>([
  'paid',
  'making',
  'ready',
  'completed',
]);
const IN_STORE_MANAGEMENT_ACTIONS: readonly PosOrderManagementAction[] = [
  'SWAP_ITEM',
  'VOID_ITEM',
  'FULL_REFUND',
  'CHANGE_PAYMENT',
];

type PosAmendmentItemInput = {
  action: OrderAmendmentItemAction;
  productStableId: string;
  qty: number;
  unitPriceCents?: number | null;
  displayName?: string | null;
  nameEn?: string | null;
  nameZh?: string | null;
  optionsJson?: Prisma.InputJsonValue;
};

export type PosCreateAmendmentInput = {
  type: OrderAmendmentType;
  reason: string;
  operatorName: string;
  paymentMethod?: PaymentMethod | null;
  refundGrossCents?: number;
  additionalChargeCents?: number;
  items?: PosAmendmentItemInput[];
};

export type PosCreateFullRefundInput = {
  reason: string;
  operatorName: string;
  refundAmountCents: number;
  originalPaymentMethod: PaymentMethod;
  refundMethod: PaymentMethod;
};

export type PosOrderManagementAction =
  | 'SWAP_ITEM'
  | 'VOID_ITEM'
  | 'FULL_REFUND'
  | 'CHANGE_PAYMENT'
  | 'UBER_CANCEL';

export type PosOrderActionCapability = {
  action: PosOrderManagementAction;
  available: boolean;
  reason?:
    | 'CLOVER_SYNC_PENDING'
    | 'ORDER_REFUNDED'
    | 'ORDER_NOT_SETTLED'
    | 'ORDER_STATUS_NOT_SUPPORTED';
};

export type PosOrderAmendmentHistory = {
  amendmentStableId: string;
  type: OrderAmendmentType;
  paymentMethod: PaymentMethod | null;
  reason: string;
  operatorName: string | null;
  deltaCents: number;
  refundCents: number;
  additionalChargeCents: number;
  summaryJson: Prisma.JsonValue | null;
  items: Array<{
    action: OrderAmendmentItemAction;
    productStableId: string;
    displayName: string | null;
    nameEn: string | null;
    nameZh: string | null;
    qty: number;
    unitPriceCents: number | null;
    optionsJson: Prisma.JsonValue | null;
  }>;
};

@Injectable()
export class PosOrdersService {
  constructor(
    private readonly orders: OrdersService,
    @Inject(UBER_EATS_ORDER_ACTIONS)
    private readonly uberOrderActions: UberEatsOrderActionsPort,
    @Inject(UBER_EATS_ORDER_STATUS_SYNC)
    private readonly uberOrderStatusSync: UberEatsOrderStatusSyncPort,
    private readonly prisma: PrismaService,
  ) {}

  async advance(orderStableId: string): Promise<PosOrderAdvanceResult> {
    const order = await this.orders.getByStableId(orderStableId);
    const nextStatus = ORDER_STATUS_ADVANCE_FLOW[order.status];
    const externalOrderId = this.getUberWebhookExternalOrderId(order);

    if (order.status === 'pending' && externalOrderId) {
      const result = await this.uberOrderActions.accept(externalOrderId);
      const current = result.ok
        ? await this.orders.getByStableId(orderStableId)
        : order;
      return this.advanceResult(current, result);
    }

    if (nextStatus === 'ready' && externalOrderId) {
      const result = await this.uberOrderStatusSync.execute(
        externalOrderId,
        'ready' satisfies OrderStatus,
      );
      const current = await this.orders.getByStableId(orderStableId);
      return this.advanceResult(
        current,
        result.ok
          ? result.actionResult
          : { errorSummary: result.error.message },
      );
    }

    return this.advanceResult(await this.orders.advance(orderStableId));
  }

  async retryUberSync(orderStableId: string): Promise<PosOrderAdvanceResult> {
    const order = await this.orders.getByStableId(orderStableId);
    const externalOrderId = this.getUberWebhookExternalOrderId(order);
    if (!externalOrderId || order.status !== 'ready') {
      throw new BadRequestException('只有已就绪的 Uber 订单可以重试同步');
    }
    const result =
      await this.uberOrderActions.retryReadyForPickup(externalOrderId);
    return this.advanceResult(order, result);
  }

  async cancelUberOrder(
    orderStableId: string,
    reason?: string,
  ): Promise<PosOrderAdvanceResult> {
    const order = await this.orders.getByStableId(orderStableId);
    const externalOrderId = this.getUberWebhookExternalOrderId(order);
    if (!externalOrderId) {
      throw new BadRequestException('只有 Uber 订单可以提交取消');
    }
    if (!['paid', 'making', 'ready'].includes(order.status)) {
      throw new BadRequestException('当前 Uber 订单状态不允许取消');
    }
    const result = await this.uberOrderActions.cancel(externalOrderId, reason);
    return this.advanceResult(order, result);
  }

  async getManagementActions(
    orderStableId: string,
  ): Promise<{ actions: PosOrderActionCapability[] }> {
    const order = await this.orders.getByStableId(orderStableId);

    if (order.channel === Channel.web) {
      return {
        actions: IN_STORE_MANAGEMENT_ACTIONS.map(
          (action): PosOrderActionCapability => ({
            action,
            available: false,
            reason: 'CLOVER_SYNC_PENDING',
          }),
        ),
      };
    }

    if (order.channel === Channel.ubereats) {
      const available = ['paid', 'making', 'ready'].includes(order.status);
      if (available) {
        return {
          actions: [{ action: 'UBER_CANCEL', available: true }],
        };
      }
      const reason: PosOrderActionCapability['reason'] =
        order.status === 'refunded'
          ? 'ORDER_REFUNDED'
          : 'ORDER_STATUS_NOT_SUPPORTED';
      return {
        actions: [{ action: 'UBER_CANCEL', available: false, reason }],
      };
    }

    const available = AMENDABLE_STATUSES.has(order.status);
    const reason: PosOrderActionCapability['reason'] | undefined = available
      ? undefined
      : order.status === 'refunded'
        ? 'ORDER_REFUNDED'
        : order.status === 'pending'
          ? 'ORDER_NOT_SETTLED'
          : 'ORDER_STATUS_NOT_SUPPORTED';

    return {
      actions: IN_STORE_MANAGEMENT_ACTIONS.map(
        (action): PosOrderActionCapability =>
          reason
            ? { action, available, reason }
            : { action, available },
      ),
    };
  }

  async createAmendment(
    orderStableId: string,
    input: PosCreateAmendmentInput,
  ): Promise<OrderDto> {
    const order = await this.orders.getByStableId(orderStableId);
    this.assertInStoreManagementOrder(order);
    const operatorName = this.requireOperatorName(input.operatorName);
    const reason = this.requireReason(input.reason);

    return this.orders.createAmendment({
      orderStableId,
      type: input.type,
      reason: this.decorateManualReason(reason, operatorName),
      paymentMethod: input.paymentMethod ?? null,
      refundGrossCents: input.refundGrossCents ?? 0,
      additionalChargeCents: input.additionalChargeCents ?? 0,
      items: input.items ?? [],
    });
  }

  async createFullRefund(
    orderStableId: string,
    input: PosCreateFullRefundInput,
  ) {
    const order = await this.orders.getByStableId(orderStableId);
    this.assertInStoreManagementOrder(order);
    const operatorName = this.requireOperatorName(input.operatorName);
    const reason = this.requireReason(input.reason);

    return this.orders.createFullRefund({
      orderStableId,
      reason: this.decorateManualReason(reason, operatorName),
      refundAmountCents: input.refundAmountCents,
      originalPaymentMethod: input.originalPaymentMethod,
      refundMethod: input.refundMethod,
    });
  }

  async listAmendments(
    orderStableId: string,
  ): Promise<PosOrderAmendmentHistory[]> {
    const order = await this.prisma.order.findUnique({
      where: { orderStableId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('order not found');

    const amendments = await this.prisma.orderAmendment.findMany({
      where: { orderId: order.id },
      include: { items: true },
    });

    return amendments.map((amendment) => {
      const parsedReason = this.parseManualReason(amendment.reason);
      return {
        amendmentStableId: amendment.amendmentStableId,
        type: amendment.type,
        paymentMethod: amendment.paymentMethod,
        reason: parsedReason.reason,
        operatorName: parsedReason.operatorName,
        deltaCents: amendment.deltaCents,
        refundCents: amendment.refundCents,
        additionalChargeCents: amendment.additionalChargeCents,
        summaryJson: amendment.summaryJson,
        items: amendment.items.map((item) => ({
          action: item.action,
          productStableId: item.productStableId,
          displayName: item.displayName,
          nameEn: item.nameEn,
          nameZh: item.nameZh,
          qty: item.qty,
          unitPriceCents: item.unitPriceCents,
          optionsJson: item.optionsJson,
        })),
      };
    });
  }

  private assertInStoreManagementOrder(order: OrderDto): void {
    if (order.channel === Channel.web) {
      throw new BadRequestException(
        'Web order management is disabled until Clover POS/payment sync is available',
      );
    }
    if (order.channel === Channel.ubereats) {
      throw new BadRequestException(
        'Uber orders must use the integrated Uber action flow',
      );
    }
    if (!AMENDABLE_STATUSES.has(order.status)) {
      throw new BadRequestException('当前订单状态不允许改单或退款');
    }
  }

  private requireOperatorName(value: string): string {
    const operatorName = value.trim();
    if (!operatorName) {
      throw new BadRequestException('operatorName is required');
    }
    return operatorName;
  }

  private requireReason(value: string): string {
    const reason = value.trim();
    if (!reason) throw new BadRequestException('reason is required');
    return reason;
  }

  private decorateManualReason(reason: string, operatorName: string): string {
    return `${reason}${POS_OPERATOR_REASON_MARKER}${operatorName}`;
  }

  private parseManualReason(value: string): {
    reason: string;
    operatorName: string | null;
  } {
    const index = value.lastIndexOf(POS_OPERATOR_REASON_MARKER);
    if (index < 0) return { reason: value, operatorName: null };
    const operatorName = value
      .slice(index + POS_OPERATOR_REASON_MARKER.length)
      .trim();
    return {
      reason: value.slice(0, index).trim(),
      operatorName: operatorName || null,
    };
  }

  private advanceResult(
    order: OrderDto,
    action?: {
      actionId?: string;
      status?: string;
      retryable?: boolean;
      errorSummary?: string;
    },
  ): PosOrderAdvanceResult {
    return {
      ...order,
      status: order.status,
      uberActionStatus: action?.status ?? null,
      retryable: action?.retryable ?? false,
      actionId: action?.actionId ?? null,
      errorSummary: action?.errorSummary ?? null,
    };
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

export type PosOrderAdvanceResult = OrderDto & {
  uberActionStatus: string | null;
  retryable: boolean;
  actionId: string | null;
  errorSummary: string | null;
};
