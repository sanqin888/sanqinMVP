import { Injectable } from '@nestjs/common';
import { Channel, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberOrderSyncRepositoryPort,
  UberOrderSyncUnitOfWorkPort,
} from '../../application/ports/uber-order-sync.ports';
import { toUberOrderStatus } from './uber-order-status.mapper';

const pendingStatuses = [
  OrderStatus.pending,
  OrderStatus.paid,
  OrderStatus.making,
];

@Injectable()
export class UberOrderSyncPrismaRepository implements UberOrderSyncRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findSyncTarget(externalOrderId: string) {
    const row = await this.prisma.order.findUnique({
      where: { clientRequestId: `ubereats:${externalOrderId}` },
      select: { orderStableId: true, status: true },
    });
    return (
      row && {
        orderStableId: row.orderStableId,
        status: toUberOrderStatus(row.status),
      }
    );
  }

  async listPending(limit: number) {
    const rows = await this.prisma.order.findMany({
      where: { channel: Channel.ubereats, status: { in: pendingStatuses } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        orderStableId: true,
        clientRequestId: true,
        status: true,
        totalCents: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      orderStableId: row.orderStableId,
      externalOrderId: row.clientRequestId?.replace('ubereats:', '') ?? null,
      status: toUberOrderStatus(row.status),
      totalCents: row.totalCents,
      createdAt: row.createdAt,
    }));
  }

  async pendingSummary() {
    const where = {
      channel: Channel.ubereats,
      status: { in: pendingStatuses },
    };
    const [count, latest] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    return { count, updatedAt: latest?.createdAt ?? null };
  }
}

@Injectable()
export class UberOrderSyncPrismaUnitOfWork implements UberOrderSyncUnitOfWorkPort {
  constructor(private readonly prisma: PrismaService) {}
  async recordActionIntent(
    input: Parameters<UberOrderSyncUnitOfWorkPort['recordActionIntent']>[0],
  ) {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.uberOrderAction.upsert({
        where: {
          externalOrderId_action: {
            externalOrderId: input.externalOrderId,
            action: input.action,
          },
        },
        create: { ...input, status: 'PENDING', businessVersion: 'v1' },
        update: {},
      });
    });
  }
}
