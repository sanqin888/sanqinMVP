import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OrderDto } from './dto/order.dto';
import {
  buildTrustedStoreOrderWhere,
  toOrderDto,
  type OrderWithItems,
} from './order-query-projection';
import type {
  PosOrderBoardQuery,
  PosOrderManagementPage,
  PosOrderManagementQuery,
} from './pos-order-operations.contract';
import { PrismaService } from './orders-prisma';

@Injectable()
export class OrderManagementQueryUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async recent(storeStableId: string, limit = 10): Promise<OrderDto[]> {
    const orders = (await this.prisma.order.findMany({
      where: buildTrustedStoreOrderWhere(storeStableId),
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    })) as OrderWithItems[];

    return orders.map((order) => toOrderDto(order));
  }

  async searchForStore(
    storeStableId: string,
    params: PosOrderManagementQuery,
  ): Promise<PosOrderManagementPage> {
    const requestedPage =
      typeof params.page === 'number' && Number.isFinite(params.page)
        ? Math.trunc(params.page)
        : 1;
    const requestedPageSize =
      typeof params.pageSize === 'number' && Number.isFinite(params.pageSize)
        ? Math.trunc(params.pageSize)
        : 50;
    const page = Math.max(1, requestedPage);
    const pageSize = Math.max(1, Math.min(100, requestedPageSize));
    const where: Prisma.OrderWhereInput = buildTrustedStoreOrderWhere(storeStableId);

    if (params.statusIn && params.statusIn.length > 0) {
      where.status = { in: params.statusIn };
    }
    if (params.channelIn && params.channelIn.length > 0) {
      where.channel = { in: params.channelIn };
    }
    if (params.fulfillmentIn && params.fulfillmentIn.length > 0) {
      where.fulfillmentType = { in: params.fulfillmentIn };
    }
    if (params.minTotalCents !== undefined) {
      where.totalCents = { gte: Math.max(0, Math.trunc(params.minTotalCents)) };
    }
    if (params.createdAtGte || params.createdAtLt) {
      where.createdAt = {
        ...(params.createdAtGte ? { gte: params.createdAtGte } : {}),
        ...(params.createdAtLt ? { lt: params.createdAtLt } : {}),
      };
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { orderStableId: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { items: true },
      }),
    ]);

    return {
      orders: (orders as OrderWithItems[]).map((order) => toOrderDto(order)),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  async board(
    storeStableId: string,
    params: PosOrderBoardQuery,
  ): Promise<OrderDto[]> {
    const {
      statusIn,
      channelIn,
      limit = 50,
      sinceMinutes = 24 * 60,
      requireItems = true,
    } = params;
    const where: Prisma.OrderWhereInput = buildTrustedStoreOrderWhere(storeStableId);
    if (statusIn && statusIn.length > 0) where.status = { in: statusIn };
    if (channelIn && channelIn.length > 0) where.channel = { in: channelIn };
    if (requireItems) where.items = { some: {} };
    if (sinceMinutes > 0) {
      const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
      where.createdAt = { gte: since };
    }

    const orders = (await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    })) as OrderWithItems[];

    return orders.map((order) => toOrderDto(order));
  }
}
