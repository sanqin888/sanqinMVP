// apps/api/src/orders/orders.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

// 单向状态机：只允许“往前”走
const NEXT: Record<OrderStatus, OrderStatus | null> = {
  pending: 'paid',
  paid: 'making',
  making: 'ready',
  ready: 'completed',
  completed: null,
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // 创建订单：金额全部在后端计算，税率默认 13%（可由 env 覆盖）
  async create(dto: CreateOrderDto): Promise<OrderWithItems> {
    const subtotalCents = Math.round(dto.subtotal * 100);
    const TAX_RATE = Number(process.env.SALES_TAX_RATE ?? 0.13);
    const taxCents = Math.round(subtotalCents * TAX_RATE);
    const totalCents = subtotalCents + taxCents;

    return this.prisma.order.create({
      data: {
        channel: dto.channel,
        fulfillmentType: dto.fulfillmentType,
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

  // 最近 N 单（默认 10）
  async recent(limit = 10): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    });
  }

  // 直接设置为某个状态：只允许“当前状态的 NEXT”
  async updateStatus(id: string, next: OrderStatus): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('order not found');

    if (order.status === next) {
      // 同一状态，直接返回（不视为非法）
      return order;
    }

    const allowed = NEXT[order.status];
    if (allowed !== next) {
      // 关键：对非法流转抛 BadRequest，单测就是在断言这里
      throw new BadRequestException(
        `illegal status transition: ${order.status} -> ${next}`,
      );
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: next },
      include: { items: true },
    });
  }

  // 按状态机自动前进一步
  async advance(id: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('order not found');

    const next = NEXT[order.status];
    if (!next) {
      throw new BadRequestException(
        `order already at terminal status: ${order.status}`,
      );
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: next },
      include: { items: true },
    });
  }
}
