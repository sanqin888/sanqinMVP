import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

<<<<<<< HEAD
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
=======
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
>>>>>>> 250f2f74e2ebb2f9e63ec055a026622d0191ba54

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

<<<<<<< HEAD
  /** 最近 N 单（默认 10，最大 100），包含 items */
  async recent(limit = 10): Promise<OrderWithItems[]> {
    const take = Math.max(1, Math.min(limit, 100));
=======
  // 最近 10 单
  async listRecent(limit = 10) {
>>>>>>> 250f2f74e2ebb2f9e63ec055a026622d0191ba54
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { items: true },
    });
  }
}
