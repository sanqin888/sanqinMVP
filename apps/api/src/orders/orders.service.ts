import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
        if (typeof i.unitPrice === 'number') {
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

  // 最近 10 单
  async listRecent(limit = 10) {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { items: true },
    });
  }
}
