import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { OrderFulfillmentTimingDto } from './dto/order-fulfillment-timing.dto';

@Injectable()
export class OrderSchedulingQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findByStableId(
    orderStableId: string,
  ): Promise<OrderFulfillmentTimingDto | null> {
    const order = await this.prisma.order.findUnique({
      where: { orderStableId },
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
}
