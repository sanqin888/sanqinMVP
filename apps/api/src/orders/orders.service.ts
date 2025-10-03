import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto): Promise<OrderWithItems> {
    const itemsData: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] =
      dto.items.map((i) => {
        const base: Prisma.OrderItemUncheckedCreateWithoutOrderInput = {
          productId: i.productId,
          qty: i.qty,
        };
        const withPrice =
          typeof i.unitPrice === 'number' && Number.isFinite(i.unitPrice)
            ? { unitPriceCents: Math.round(i.unitPrice * 100) }
            : {};
        const withOptions =
          typeof i.options !== 'undefined'
            ? { optionsJson: i.options as Prisma.InputJsonValue }
            : {};
        return { ...base, ...withPrice, ...withOptions };
      });

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

  /** 最近 N 单（默认 10，最大 100） */
  async recent(limit = 10): Promise<OrderWithItems[]> {
    const take = Math.max(1, Math.min(limit, 100));
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { items: true },
    });
  }
}
