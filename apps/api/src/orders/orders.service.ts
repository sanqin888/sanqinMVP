import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

// 返回值统一带 items，避免 any 推断
type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /** 支持 0.13 或 "13" / "13%" 的写法，默认 13% */
  private getTaxRate(): number {
    const raw = process.env.SALES_TAX_RATE ?? '0.13';
    const n = Number(String(raw).replace('%', ''));
    if (Number.isNaN(n)) return 0.13;
    return n > 1 ? n / 100 : n;
  }

  /** 创建订单（金额统一在后端计算） */
  async create(dto: CreateOrderDto): Promise<OrderWithItems> {
    const subtotalCents = Math.round(dto.subtotal * 100);
    const taxCents = Math.round(subtotalCents * this.getTaxRate());
    const totalCents = subtotalCents + taxCents;

    return this.prisma.order.create({
      data: {
        channel: dto.channel,                 // 'web' | 'in_store' | 'ubereats'
        fulfillmentType: dto.fulfillmentType, // 'pickup' | 'dine_in'
        status: 'pending',
        subtotalCents,
        taxCents,
        totalCents,
        pickupCode: (1000 + Math.floor(Math.random() * 9000)).toString(),
        items: {
          create: dto.items.map((i): Prisma.OrderItemCreateWithoutOrderInput => {
            const item: Prisma.OrderItemCreateWithoutOrderInput = {
              productId: i.productId,
              qty: i.qty,
            };
            if (typeof i.unitPrice === 'number') {
              item.unitPriceCents = Math.round(i.unitPrice * 100);
            }
            if (typeof i.options !== 'undefined') {
              item.optionsJson = i.options as Prisma.InputJsonValue;
            }
            return item;
          }),
        },
      },
      include: { items: true },
    });
  }

  /** 最近 N 单（默认 10 单） */
  async recent(limit = 10): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    });
  }

  /** 显式更新订单状态 */
  async updateStatus(id: string, status: OrderStatus): Promise<OrderWithItems> {
    const exists = await this.prisma.order.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Order not found');

    return this.prisma.order.update({
      where: { id },
      data: { status },
      include: { items: true },
    });
  }

  /** 状态推进：pending→paid→making→ready→completed；终态保持不变 */
  async advance(id: string): Promise<OrderWithItems> {
    const current = await this.prisma.order.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Order not found');

    const next = this.nextStatus(current.status as OrderStatus);
    if (next === current.status) {
      // 已经终态，直接带 items 返回
      const withItems = await this.prisma.order.findUnique({
        where: { id },
        include: { items: true },
      });
      return withItems as OrderWithItems;
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: next },
      include: { items: true },
    });
  }

  /** 内部：根据当前状态得到下一个状态 */
  private nextStatus(current: OrderStatus): OrderStatus {
    switch (current) {
      case 'pending':  return 'paid';
      case 'paid':     return 'making';
      case 'making':   return 'ready';
      case 'ready':    return 'completed';
      default:         return current; // completed/refunded 等
    }
  }
}
