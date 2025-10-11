import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { CreateOrderDto } from './dto/create-order.dto';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

const TAX_RATE = Number(process.env.SALES_TAX_RATE ?? '0.13');
const REDEEM_DOLLAR_PER_POINT = Number(
  process.env.LOYALTY_REDEEM_DOLLAR_PER_POINT ?? '0.01',
);

@Injectable()
export class OrdersService {
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

  async create(dto: CreateOrderDto): Promise<OrderWithItems> {
    // 1) 服务端重算金额
    const subtotalCents = Math.round(dto.subtotal * 100);

    // 2) 计算本单抵扣
    const redeemValueCents = await this.calcRedeemCents(
      dto.userId,
      dto.pointsToRedeem,
      subtotalCents,
    );

    // 3) 税基 = 小计 - 抵扣
    const taxableCents = Math.max(0, subtotalCents - redeemValueCents);
    const taxCents = Math.round(taxableCents * TAX_RATE);
    const totalCents = taxableCents + taxCents;

    // 4) 入库
    const order = await this.prisma.order.create({
      data: {
        userId: dto.userId ?? null,
        channel: dto.channel,
        fulfillmentType: dto.fulfillmentType,
        subtotalCents,
        taxCents,
        totalCents,
        pickupCode: (1000 + Math.floor(Math.random() * 9000)).toString(),
        items: {
          create: dto.items.map(
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

  /** 允许的状态迁移（⚠️ ready 不可退款） */
  private readonly transitions: Record<OrderStatus, readonly OrderStatus[]> = {
    pending: ['paid'],
    paid: ['making', 'refunded'],
    making: ['ready', 'refunded'],
    ready: ['completed'], // ← 这里去掉 'refunded'
    completed: [],
    refunded: [],
  };

  async updateStatus(id: string, next: OrderStatus): Promise<OrderWithItems> {
    const current = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('order not found');

    if (!this.transitions[current.status].includes(next)) {
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

    const flow: Record<OrderStatus, OrderStatus | null> = {
      pending: 'paid',
      paid: 'making',
      making: 'ready',
      ready: 'completed',
      completed: null,
      refunded: null,
    };
    const next = flow[order.status];
    if (!next)
      return (await this.prisma.order.findUnique({
        where: { id },
        include: { items: true },
      })) as OrderWithItems;

    return this.updateStatus(id, next);
  }
}
