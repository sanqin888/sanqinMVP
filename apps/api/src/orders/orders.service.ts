import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client'; // 仅需要 Prisma 类型
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto) {
    return this.prisma.order.create({
      data: {
        channel: dto.channel,                 // 'web' | 'in_store' | 'ubereats'
        fulfillmentType: dto.fulfillmentType, // 'pickup' | 'dine_in'
        subtotalCents: Math.round(dto.subtotal * 100),
        taxCents: Math.round(dto.taxTotal * 100),
        totalCents: Math.round(dto.total * 100),
        pickupCode: (1000 + Math.floor(Math.random() * 9000)).toString(),
        items: {
          create: dto.items.map((i) => {
            const item: any = {
              productId: i.productId,
              qty: i.qty,
            };
            if (typeof i.unitPrice === 'number') {
              item.unitPriceCents = Math.round(i.unitPrice * 100);
            }
            if (typeof i.options !== 'undefined') {
              // 仅在有值时设置；类型上转成 Prisma 接受的 JSON 输入
              item.optionsJson = i.options as Prisma.InputJsonValue;
            }
            return item;
          }),
        },
      },
      include: { items: true }, // 保证控制器的返回类型匹配
    });
  }

  /** 最近 N 单（默认 10，最大 100），包含明细 items */
  async recent(limit = 10) {
    const take = Math.max(1, Math.min(limit, 100));
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { items: true },
    });
  }
}
