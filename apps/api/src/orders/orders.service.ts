import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryProvider,
  DeliveryType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  ORDER_STATUS_ADVANCE_FLOW,
  ORDER_STATUS_TRANSITIONS,
  OrderStatus,
} from './order-status';
import { normalizeStableId } from '../common/utils/stable-id';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

const TAX_RATE = Number(process.env.SALES_TAX_RATE ?? '0.13');
const REDEEM_DOLLAR_PER_POINT = Number(
  process.env.LOYALTY_REDEEM_DOLLAR_PER_POINT ?? '0.01',
);

const DELIVERY_RULES: Record<
  DeliveryType,
  { provider: DeliveryProvider; feeCents: number; etaRange: [number, number] }
> = {
  [DeliveryType.STANDARD]: {
    provider: DeliveryProvider.DOORDASH_DRIVE,
    feeCents: 500,
    etaRange: [45, 60],
  },
  [DeliveryType.PRIORITY]: {
    provider: DeliveryProvider.UBER_DIRECT,
    feeCents: 900,
    etaRange: [25, 35],
  },
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  /** 计算“本单可用的抵扣额（分）”，受余额 / 用户请求 / 小计 的三重上限约束 */
  private async calcRedeemCents(
    userId: string | undefined,
    requestedPoints?: number,
    subtotalCents?: number,
  ): Promise<number> {
    if (!userId || !requestedPoints || requestedPoints <= 0) return 0;

    const balanceMicro = await this.loyalty.peekBalanceMicro(userId);
    const maxByBalance =
      this.loyalty.maxRedeemableCentsFromBalance(balanceMicro);

    // 用户请求的点数 → 折算成“可抵扣金额（分）”
    const requestedCents = Math.floor(
      requestedPoints * REDEEM_DOLLAR_PER_POINT * 100,
    );

    const byUserInput = Math.min(requestedCents, maxByBalance);
    return Math.max(0, Math.min(byUserInput, subtotalCents ?? byUserInput));
  }

  async create(
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderWithItems> {
    const headerKey =
      typeof idempotencyKey === 'string' ? idempotencyKey.trim() : undefined;
    const normalizedHeaderKey = normalizeStableId(headerKey);
    if (headerKey && !normalizedHeaderKey) {
      this.logger.warn(`Ignoring invalid Idempotency-Key header: ${headerKey}`);
    }

    const bodyStableKey = normalizeStableId(dto.clientRequestId);
    const stableKey = normalizedHeaderKey ?? bodyStableKey;

    if (stableKey) {
      const existing = await this.prisma.order.findUnique({
        where: { clientRequestId: stableKey },
        include: { items: true },
      });
      if (existing) return existing;
    }

    // 1) 服务端重算金额（兼容旧版“单位：分”字段）
    const subtotalCentsRaw =
      typeof dto.subtotalCents === 'number'
        ? dto.subtotalCents
        : typeof dto.subtotal === 'number'
          ? Math.round(dto.subtotal * 100)
          : undefined;

    if (
      typeof subtotalCentsRaw !== 'number' ||
      Number.isNaN(subtotalCentsRaw)
    ) {
      throw new BadRequestException('subtotal is required');
    }
    const subtotalCents = subtotalCentsRaw;

    const requestedPoints =
      typeof dto.pointsToRedeem === 'number'
        ? dto.pointsToRedeem
        : typeof dto.redeemValueCents === 'number' &&
            REDEEM_DOLLAR_PER_POINT > 0
          ? Math.floor(dto.redeemValueCents / (REDEEM_DOLLAR_PER_POINT * 100))
          : undefined;

    // 2) 计算本单抵扣
    const redeemValueCents = await this.calcRedeemCents(
      dto.userId,
      requestedPoints,
      subtotalCents,
    );

    // 3) 税基 = 小计 - 抵扣
    const taxableCents = Math.max(0, subtotalCents - redeemValueCents);
    const taxCents = Math.round(taxableCents * TAX_RATE);
    const totalCents = taxableCents + taxCents;

    // 4) 入库
    const deliveryMeta = dto.deliveryType
      ? DELIVERY_RULES[dto.deliveryType]
      : undefined;

    const order = await this.prisma.order.create({
      data: {
        userId: dto.userId ?? null,
        ...(stableKey ? { clientRequestId: stableKey } : {}),
        channel: dto.channel,
        fulfillmentType: dto.fulfillmentType,
        subtotalCents,
        taxCents,
        totalCents,
        pickupCode: (1000 + Math.floor(Math.random() * 9000)).toString(),
        ...(deliveryMeta
          ? {
              deliveryType: dto.deliveryType,
              deliveryProvider: deliveryMeta.provider,
              deliveryFeeCents: deliveryMeta.feeCents,
              deliveryEtaMinMinutes: deliveryMeta.etaRange[0],
              deliveryEtaMaxMinutes: deliveryMeta.etaRange[1],
            }
          : {}),
        items: {
          create: (Array.isArray(dto.items) ? dto.items : []).map(
            (i): Prisma.OrderItemCreateWithoutOrderInput => ({
              productId: i.productId,
              qty: i.qty,
              ...(typeof i.unitPrice === 'number'
                ? { unitPriceCents: Math.round(i.unitPrice * 100) }
                : {}),
              ...(typeof i.options !== 'undefined'
                ? { optionsJson: i.options as Prisma.InputJsonValue }
                : {}),
            }),
          ),
        },
      },
      include: { items: true },
    });

    return order;
  }

  async recent(limit = 10): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    });
  }

  async getById(id: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  /** 允许的状态迁移（⚠️ ready 不可退款） */
  async updateStatus(id: string, next: OrderStatus): Promise<OrderWithItems> {
    const current = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('order not found');

    if (!ORDER_STATUS_TRANSITIONS[current.status].includes(next)) {
      throw new BadRequestException(
        `illegal transition ${current.status} -> ${next}`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: next },
      include: { items: true },
    });

    // —— 积分结算（异步，不阻塞响应）
    if (next === 'paid') {
      // 反推“本单抵扣额（分）”： R = S - (T - tax)
      const redeemValueCents = Math.max(
        0,
        updated.subtotalCents - (updated.totalCents - updated.taxCents),
      );
      void this.loyalty.settleOnPaid({
        orderId: updated.id,
        userId: updated.userId ?? undefined,
        subtotalCents: updated.subtotalCents,
        redeemValueCents,
        taxRate: TAX_RATE,
      });
    } else if (next === 'refunded') {
      void this.loyalty.rollbackOnRefund(updated.id);
    }

    return updated;
  }

  async advance(id: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!order) throw new NotFoundException('order not found');

    const next = ORDER_STATUS_ADVANCE_FLOW[order.status];
    if (!next)
      return (await this.prisma.order.findUnique({
        where: { id },
        include: { items: true },
      })) as OrderWithItems;

    return this.updateStatus(id, next);
  }
}
