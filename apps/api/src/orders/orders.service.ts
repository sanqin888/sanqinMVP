import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto) {
    const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = dto.items.map(
      (i) => {
        const item: Prisma.OrderItemCreateWithoutOrderInput = {
          productId: i.productId,
          qty: i.qty,
        };
        if (typeof i.unitPrice === 'number' && Number.isFinite(i.unitPrice)) {
          item.unitPriceCents = Math.round(i.unitPrice * 100);
        }
        if (typeof i.options !== 'undefined') {
          item.optionsJson = i.options as Prisma.InputJsonValue;
        }
        return item;
      },
    );

    return this.prisma.order.create({
      data: {
        channel: dto.channel,
        fulfillmentType: dto.fulfillmentType,
        subtotalCents: Math.round(dto.subtotal * 100),
        taxCents: Math.round(dto.taxTotal * 100),
        totalCents: Math.round(dto.total * 100),
        pickupCode: (1000 + Math.floor(Math.random() * 9000)).toString(),
        items: { create: itemsData },
      },
      include: { items: true },
    });
  }

  // 最近 N 单
  async recent(limit = 10) {
    const take = Math.max(1, Math.min(limit, 100));
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { items: true },
    });
  }

  // 合法状态流
  private static readonly ALLOWED: Record<
    OrderStatus,
    ReadonlyArray<OrderStatus>
  > = {
    pending: ['paid'],
    paid: ['making'],
    making: ['ready'],
    ready: ['completed'],
    completed: [],
  };

  // 前进一步
  async advanceStatus(id: string) {
    const cur = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!cur) throw new NotFoundException('Order not found');

    const next = OrdersService.ALLOWED[cur.status][0];
    if (!next)
      throw new BadRequestException(
        `Order already at terminal status: ${cur.status}`,
      );

    return this.updateStatus(id, next);
  }

  // 设置为指定状态（带校验）
  async updateStatus(id: string, next: OrderStatus) {
    const cur = await this.prisma.order.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!cur) throw new NotFoundException('Order not found');

    const allowedNexts = OrdersService.ALLOWED[cur.status];
    if (!allowedNexts.includes(next)) {
      throw new BadRequestException(
        `Invalid transition: ${cur.status} -> ${next}`,
      );
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: next },
      include: { items: true },
    });
  }
}
