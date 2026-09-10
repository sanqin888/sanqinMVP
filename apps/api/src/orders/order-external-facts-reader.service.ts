import { Injectable } from '@nestjs/common';

import type {
  ExternalOrderIdentity,
  OrderExternalFactsReaderPort,
} from './order-external-facts-reader.contract';
import { PrismaService } from './orders-prisma';

const externalClientRequestId = (identity: ExternalOrderIdentity): string =>
  `${identity.channel}:${identity.externalOrderId}`;

const externalOrderIdFromClientRequestId = (
  channel: ExternalOrderIdentity['channel'],
  clientRequestId: string | null,
): string | null => {
  const prefix = `${channel}:`;
  return clientRequestId?.startsWith(prefix)
    ? clientRequestId.slice(prefix.length)
    : null;
};

@Injectable()
export class OrderExternalFactsReaderService
  implements OrderExternalFactsReaderPort
{
  constructor(private readonly prisma: PrismaService) {}

  async findByExternalIdentity(identity: ExternalOrderIdentity) {
    const order = await this.prisma.order.findFirst({
      where: {
        channel: identity.channel,
        clientRequestId: externalClientRequestId(identity),
      },
      select: {
        orderStableId: true,
        status: true,
        totalCents: true,
        createdAt: true,
        paidAt: true,
        fulfillmentTiming: true,
        externalEstimatedReadyAt: true,
      },
    });
    if (!order) return null;
    return {
      orderStableId: order.orderStableId,
      status: order.status,
      totalCents: order.totalCents,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
      fulfillmentTiming: order.fulfillmentTiming,
      externalEstimatedReadyAt:
        order.externalEstimatedReadyAt?.toISOString() ?? null,
    };
  }

  async existsByExternalIdentity(identity: ExternalOrderIdentity) {
    return !!(await this.prisma.order.findFirst({
      where: {
        channel: identity.channel,
        clientRequestId: externalClientRequestId(identity),
      },
      select: { orderStableId: true },
    }));
  }

  async findSchedulingByOrderStableId(orderStableId: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderStableId },
      select: {
        orderStableId: true,
        scheduledReadyAt: true,
        prepStartAt: true,
        prepDurationMinutes: true,
      },
    });
    if (!order) return null;
    return {
      orderStableId: order.orderStableId,
      scheduledReadyAt: order.scheduledReadyAt?.toISOString() ?? null,
      prepStartAt: order.prepStartAt?.toISOString() ?? null,
      prepDurationMinutes: order.prepDurationMinutes,
    };
  }

  async listByChannelAndStatuses(
    input: Parameters<
      OrderExternalFactsReaderPort['listByChannelAndStatuses']
    >[0],
  ) {
    const rows = await this.prisma.order.findMany({
      where: {
        channel: input.channel,
        status: { in: [...input.statuses] },
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      select: {
        orderStableId: true,
        clientRequestId: true,
        pickupCode: true,
        status: true,
        totalCents: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      orderStableId: row.orderStableId,
      externalOrderId: externalOrderIdFromClientRequestId(
        input.channel,
        row.clientRequestId,
      ),
      pickupCode: row.pickupCode,
      status: row.status,
      totalCents: row.totalCents,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async summarizeByChannelAndStatuses(
    input: Parameters<
      OrderExternalFactsReaderPort['summarizeByChannelAndStatuses']
    >[0],
  ) {
    const where = {
      channel: input.channel,
      status: { in: [...input.statuses] },
    };
    const [count, latest] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    return {
      count,
      latestCreatedAt: latest?.createdAt.toISOString() ?? null,
    };
  }

  async listReconciliationFacts(
    input: Parameters<
      OrderExternalFactsReaderPort['listReconciliationFacts']
    >[0],
  ) {
    return this.prisma.order.findMany({
      where: {
        channel: input.channel,
        storeId: input.storeStableId,
        createdAt: {
          gte: new Date(input.createdAtFrom),
          lt: new Date(input.createdAtBefore),
        },
      },
      select: { status: true, totalCents: true },
    });
  }
}
