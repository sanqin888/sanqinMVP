import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { LoyaltyService } from '../loyalty/loyalty.service';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  /** 创建订单：金额后端统一计算（含税=小计*税率，四舍五入到分） */
  async create(dto: CreateOrderDto): Promise<OrderWithItems> {
    const subtotalCents = Math.round(dto.subtotal * 100);
    const TAX_RATE = Number(process.env.SALES_TAX_RATE ?? 0.13);
    const taxCents = Math.round(subtotalCents * TAX_RATE);
    const totalCents = subtotalCents + taxCents;

    return this.prisma.order.create({
      data: {
        userId: dto.userId ?? null,
        channel: dto.channel, // 'web' | 'in_store' | 'ubereats'
        fulfillmentType: dto.fulfillmentType, // 'pickup' | 'dine_in'
        subtotalCents,
        taxCents,
        totalCents,
        pickupCode: (1000 + Math.floor(Math.random() * 9000)).toString(),
        items: {
          create: dto.items.map((i) => {
            const item: Prisma.OrderItemCreateWithoutOrderInput = {
              productId: i.productId,
              qty: i.qty,
              ...(typeof i.unitPrice === 'number'
                ? { unitPriceCents: Math.round(i.unitPrice * 100) }
                : {}),
              ...(typeof i.options !== 'undefined'
                ? { optionsJson: i.options as Prisma.InputJsonValue }
                : {}),
            };
            return item;
          }),
        },
      },
      include: { items: true },
    });
  }

  /** 最近 N 单（默认 10） */
  async recent(limit = 10): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    });
  }

  /** 合法状态迁移表 */
  private allowedNext: Record<OrderStatus, ReadonlyArray<OrderStatus>> = {
    pending: ['paid'],
    paid: ['making'],
    making: ['ready'],
    ready: ['completed'],
    completed: [],
    refunded: [], // 这里只做占位，实际退款流程另行处理
  };

  /** 更新订单状态；从非 paid -> paid 时记积分（用 subtotalCents） */
  async updateStatus(id: string, next: OrderStatus): Promise<OrderWithItems> {
    // 1) 读取当前状态
    const current = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('order not found');

    // 2) 校验合法迁移
    const allowed = this.allowedNext[current.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `illegal status transition: ${current.status} -> ${next}`,
      );
    }

    // 3) 执行更新（只更新一次，避免重复声明变量）
    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: next },
      include: { items: true }, // 返回带 items 的完整订单
    });

    // 4) 首次从非 paid 变为 paid，且有 userId 才记积分（用小计，不含税）
    if (current.status !== 'paid' && next === 'paid' && updated.userId) {
      void this.loyalty.earnOnOrderPaid({
        orderId: updated.id,
        userId: updated.userId, // 这里已保证存在
        subtotalCents: updated.subtotalCents,
      });
    }

    return updated;
  }

  /** 推进状态：按 allowedNext 自动前进一步 */
  async advance(id: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!order) throw new NotFoundException('order not found');

    const next = this.allowedNext[order.status]?.[0];
    if (!next) throw new BadRequestException('no further transition');

    return this.updateStatus(id, next);
  }
}
