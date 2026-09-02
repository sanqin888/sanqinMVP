import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderFulfillmentTiming, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { OrderFulfillmentTimingDto } from './dto/order-fulfillment-timing.dto';
import type { ScheduledOrderSummaryDto } from './dto/scheduled-order-summary.dto';

@Injectable()
export class OrderSchedulingQueryService {
  constructor(private readonly prisma: PrismaService) {}

  private storeWhere(storeStableId: string): Prisma.OrderWhereInput {
    const normalizedStoreStableId = storeStableId.trim();
    if (!normalizedStoreStableId) {
      throw new BadRequestException('storeStableId is required');
    }
    return {
      storeId: normalizedStoreStableId,
    };
  }

  async findByStableIdForStore(
    orderStableId: string,
    storeStableId: string,
  ): Promise<OrderFulfillmentTimingDto | null> {
    const order = await this.prisma.order.findFirst({
      where: {
        orderStableId,
        ...this.storeWhere(storeStableId),
      },
      select: {
        orderStableId: true,
        status: true,
        fulfillmentTiming: true,
        scheduledReadyAt: true,
        prepStartAt: true,
        prepDurationMinutes: true,
        scheduleActivatedAt: true,
        externalEstimatedReadyAt: true,
      },
    });
    if (!order) return null;
    return {
      orderStableId: order.orderStableId,
      status: order.status,
      fulfillmentTiming: order.fulfillmentTiming,
      scheduledReadyAt: order.scheduledReadyAt?.toISOString() ?? null,
      prepStartAt: order.prepStartAt?.toISOString() ?? null,
      prepDurationMinutes: order.prepDurationMinutes,
      scheduleActivatedAt: order.scheduleActivatedAt?.toISOString() ?? null,
      externalEstimatedReadyAt:
        order.externalEstimatedReadyAt?.toISOString() ?? null,
    };
  }

  async findTimingsByStableIdsForStore(
    orderStableIds: string[],
    storeStableId: string,
  ): Promise<Map<string, OrderFulfillmentTiming>> {
    const stableIds = [
      ...new Set(orderStableIds.map((value) => value.trim()).filter(Boolean)),
    ];
    if (stableIds.length === 0) return new Map();

    const orders = await this.prisma.order.findMany({
      where: {
        orderStableId: { in: stableIds },
        ...this.storeWhere(storeStableId),
      },
      select: { orderStableId: true, fulfillmentTiming: true },
    });

    return new Map(
      orders.map((order) => [order.orderStableId, order.fulfillmentTiming]),
    );
  }

  async listUpcomingForStoreStableId(
    storeStableId: string,
  ): Promise<ScheduledOrderSummaryDto[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        storeId: storeStableId,
        fulfillmentTiming: OrderFulfillmentTiming.SCHEDULED,
        scheduleActivatedAt: null,
        status: { in: [OrderStatus.pending, OrderStatus.paid] },
        prepStartAt: { not: null },
        scheduledReadyAt: { not: null },
      },
      select: {
        orderStableId: true,
        clientRequestId: true,
        externalDisplayId: true,
        channel: true,
        prepStartAt: true,
        scheduledReadyAt: true,
        items: { select: { qty: true } },
      },
      orderBy: [{ prepStartAt: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    });

    return orders.flatMap((order) => {
      if (!order.prepStartAt || !order.scheduledReadyAt) return [];
      return [
        {
          orderStableId: order.orderStableId,
          orderNumber:
            order.externalDisplayId ??
            order.clientRequestId ??
            order.orderStableId,
          channel: order.channel,
          productionStartAt: order.prepStartAt.toISOString(),
          scheduledFor: order.scheduledReadyAt.toISOString(),
          itemCount: order.items.reduce((sum, item) => sum + item.qty, 0),
        },
      ];
    });
  }
}
