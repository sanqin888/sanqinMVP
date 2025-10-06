import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import type { OrderStatus } from './dto/update-order-status.dto';

const FLOW: OrderStatus[] = ['pending', 'paid', 'making', 'ready', 'completed'];

function nextOf(s: OrderStatus): OrderStatus {
  const i = FLOW.indexOf(s);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : s;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // 统一处理 Prisma 错误，避免 “unsafe assignment”
  private handlePrismaError(e: unknown): never {
    if (e instanceof HttpException) {
      throw e;
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') {
        throw new NotFoundException('Order not found');
      }
      throw new InternalServerErrorException(e.message);
    }
    if (e instanceof Error) {
      throw new InternalServerErrorException(e.message);
    }
    throw new InternalServerErrorException('Unknown error');
  }

  async create(dto: CreateOrderDto) {
    try {
      return await this.prisma.order.create({
        data: {
          channel: dto.channel,
          fulfillmentType: dto.fulfillmentType,
          subtotalCents: Math.round(dto.subtotal * 100),
          taxCents: Math.round(dto.taxTotal * 100),
          totalCents: Math.round(dto.total * 100),
          pickupCode: (1000 + Math.floor(Math.random() * 9000)).toString(),
          // status 默认由 DB/应用层给 pending，如需显式设置可加上
          items: {
            create: dto.items.map((i) => {
              const out: Prisma.OrderItemCreateWithoutOrderInput = {
                productId: i.productId,
                qty: i.qty,
              };
              if (typeof i.unitPrice === 'number') {
                out.unitPriceCents = Math.round(i.unitPrice * 100);
              }
              if (typeof i.options !== 'undefined') {
                out.optionsJson = i.options as Prisma.InputJsonValue;
              }
              return out;
            }),
          },
        },
        include: { items: true },
      });
    } catch (e: unknown) {
      this.handlePrismaError(e);
    }
  }

  async updateStatus(id: string, next: OrderStatus) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Order not found');

      const cur = order.status as OrderStatus;
      const curIdx = FLOW.indexOf(cur);
      const nextIdx = FLOW.indexOf(next);
      if (curIdx === -1 || nextIdx === -1 || nextIdx < curIdx) {
        throw new BadRequestException('Illegal status transition');
      }

      return await this.prisma.order.update({
        where: { id },
        data: { status: next },
        include: { items: true },
      });
    } catch (e: unknown) {
      this.handlePrismaError(e);
    }
  }

  async advance(id: string) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Order not found');

      const cur = order.status as OrderStatus;
      const nxt = nextOf(cur);
      if (nxt === cur) {
        // 已是 completed，不再前进
        return order;
      }

      return await this.prisma.order.update({
        where: { id },
        data: { status: nxt },
        include: { items: true },
      });
    } catch (e: unknown) {
      this.handlePrismaError(e);
    }
  }

  async recent(limit = 10) {
    try {
      const normalizedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 10;
      const take = Math.min(50, Math.max(1, normalizedLimit));
      return await this.prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        include: { items: true },
      });
    } catch (e: unknown) {
      this.handlePrismaError(e);
    }
  }
}
