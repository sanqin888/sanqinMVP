/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents -- Prisma types are generated in the build environment */
import { Injectable } from '@nestjs/common';
import {
  Channel,
  UberOpsTicketStatus as DbTicketStatus,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberMenuItemOperationsRepositoryPort,
  UberOperationsUnitOfWorkPort,
  UberOperationsRepositoryScope,
  UberOpsTicketRepositoryPort,
  UberOrderOperationsRepositoryPort,
  UberReconciliationRepositoryPort,
} from '../../application/ports/uber-operations.ports';
import type { UberOpsTicketStatus } from '../../domain/operations/uber-operations.types';
import {
  toDomainTicketPriority,
  toDomainTicketStatus,
  toDomainTicketType,
  toPrismaTicketPriority,
  toPrismaTicketStatus,
  toPrismaTicketType,
} from './uber-operations-enum.mapper';
import { toUberOrderStatus } from './uber-order-status.mapper';

type ReconciliationRow = {
  reportStableId: string;
  rangeStart: Date;
  rangeEnd: Date;
  totalOrders: number;
  totalAmountCents: number;
  syncedOrders: number;
  pendingOrders: number;
  failedSyncEvents: number;
  discrepancyOrders: number;
  createdAt: Date;
};

export const mapReconciliationRow = (row: ReconciliationRow) => ({
  reportStableId: row.reportStableId,
  rangeStart: row.rangeStart,
  rangeEnd: row.rangeEnd,
  totalOrders: row.totalOrders,
  totalAmountCents: row.totalAmountCents,
  syncedOrders: row.syncedOrders,
  pendingOrders: row.pendingOrders,
  failedSyncEvents: row.failedSyncEvents,
  discrepancyOrders: row.discrepancyOrders,
  createdAt: row.createdAt,
});

type TicketRow = {
  ticketStableId: string;
  storeId: string;
  type: Parameters<typeof toDomainTicketType>[0];
  status: Parameters<typeof toDomainTicketStatus>[0];
  priority: Parameters<typeof toDomainTicketPriority>[0];
  title: string;
  externalOrderId: string | null;
  menuItemStableId: string | null;
  retryCount: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const mapOpsTicketRow = (row: TicketRow) => ({
  ticketStableId: row.ticketStableId,
  storeId: row.storeId,
  type: toDomainTicketType(row.type),
  status: toDomainTicketStatus(row.status),
  priority: toDomainTicketPriority(row.priority),
  title: row.title,
  externalOrderId: row.externalOrderId,
  menuItemStableId: row.menuItemStableId,
  retryCount: row.retryCount,
  lastError: row.lastError,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

@Injectable()
export class UberOrderOperationsPrismaRepository implements UberOrderOperationsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async reconciliationOrders(rangeStart: Date, rangeEnd: Date) {
    const rows = await this.prisma.order.findMany({
      where: {
        channel: Channel.ubereats,
        createdAt: { gte: rangeStart, lt: rangeEnd },
      },
      select: { status: true, totalCents: true },
    });
    return rows.map((row) => ({
      status: toUberOrderStatus(row.status),
      totalCents: row.totalCents,
    }));
  }
  async exists(externalOrderId: string) {
    return !!(await this.prisma.order.findUnique({
      where: { clientRequestId: `ubereats:${externalOrderId}` },
      select: { id: true },
    }));
  }
}

@Injectable()
export class UberMenuItemOperationsPrismaRepository implements UberMenuItemOperationsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  async exists(stableId: string) {
    return !!(await this.prisma.menuItem.findUnique({
      where: { stableId },
      select: { stableId: true },
    }));
  }
}

@Injectable()
export class UberReconciliationPrismaRepository implements UberReconciliationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}
  countFailedSyncEvents(rangeStart: Date, rangeEnd: Date) {
    return this.prisma.opsEvent.count({
      where: {
        source: 'ubereats',
        eventName: {
          in: [
            'ubereats_order_sync_failed',
            'ubereats_menu_publish_failed',
            'ubereats_menu_item_availability_sync_failed',
          ],
        },
        createdAt: { gte: rangeStart, lt: rangeEnd },
      },
    });
  }
  save(input: Parameters<UberReconciliationRepositoryPort['save']>[0]) {
    return this.prisma.uberReconciliationReport.create({
      data: { ...input, payload: input.payload as Prisma.InputJsonValue },
      select: { reportStableId: true, createdAt: true },
    });
  }
  async list(storeId: string, limit: number) {
    const rows = await this.prisma.uberReconciliationReport.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        reportStableId: true,
        rangeStart: true,
        rangeEnd: true,
        totalOrders: true,
        totalAmountCents: true,
        syncedOrders: true,
        pendingOrders: true,
        failedSyncEvents: true,
        discrepancyOrders: true,
        createdAt: true,
      },
    });
    return rows.map(mapReconciliationRow);
  }
  async summary(storeId: string) {
    const [count, latest] = await Promise.all([
      this.prisma.uberReconciliationReport.count({ where: { storeId } }),
      this.prisma.uberReconciliationReport.findFirst({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    return { count, updatedAt: latest?.createdAt ?? null };
  }
}

class TicketRepository implements UberOpsTicketRepositoryPort {
  constructor(private readonly db: Prisma.TransactionClient | PrismaService) {}
  countOpen(storeId: string) {
    return this.db.uberOpsTicket.count({
      where: {
        storeId,
        status: { in: [DbTicketStatus.OPEN, DbTicketStatus.IN_PROGRESS] },
      },
    });
  }
  async create(input: Parameters<UberOpsTicketRepositoryPort['create']>[0]) {
    const row = await this.db.uberOpsTicket.create({
      data: {
        ...input,
        type: toPrismaTicketType(input.type),
        priority: toPrismaTicketPriority(input.priority),
        status: DbTicketStatus.OPEN,
        context: input.context as Prisma.InputJsonValue,
      },
      select: {
        ticketStableId: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    });
    return {
      ticketStableId: row.ticketStableId,
      status: toDomainTicketStatus(row.status),
      priority: toDomainTicketPriority(row.priority),
      createdAt: row.createdAt,
    };
  }
  async list(storeId: string, status?: UberOpsTicketStatus) {
    const rows = await this.db.uberOpsTicket.findMany({
      where: {
        storeId,
        ...(status ? { status: toPrismaTicketStatus(status) } : {}),
      },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        ticketStableId: true,
        storeId: true,
        type: true,
        status: true,
        priority: true,
        title: true,
        externalOrderId: true,
        menuItemStableId: true,
        retryCount: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map(mapOpsTicketRow);
  }
  async summary(storeId: string, status?: UberOpsTicketStatus) {
    const where = {
      storeId,
      ...(status ? { status: toPrismaTicketStatus(status) } : {}),
    };
    const [count, latest] = await Promise.all([
      this.db.uberOpsTicket.count({ where }),
      this.db.uberOpsTicket.findFirst({
        where,
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);
    return { count, updatedAt: latest?.updatedAt ?? null };
  }
  async find(ticketStableId: string) {
    const row = await this.db.uberOpsTicket.findUnique({
      where: { ticketStableId },
    });
    if (!row) return null;
    return {
      ...mapOpsTicketRow(row),
      description: row.description,
      context: row.context as Parameters<
        UberOpsTicketRepositoryPort['create']
      >[0]['context'],
      resolvedAt: row.resolvedAt,
    };
  }
  async markInProgress(ticketStableId: string) {
    await this.db.uberOpsTicket.update({
      where: { ticketStableId },
      data: { status: DbTicketStatus.IN_PROGRESS },
    });
  }
  async finishRetry(ticketStableId: string, error: string | null) {
    const row = await this.db.uberOpsTicket.update({
      where: { ticketStableId },
      data: error
        ? {
            status: DbTicketStatus.OPEN,
            retryCount: { increment: 1 },
            lastError: error,
          }
        : {
            status: DbTicketStatus.RESOLVED,
            retryCount: { increment: 1 },
            lastError: null,
            resolvedAt: new Date(),
          },
      select: {
        ticketStableId: true,
        status: true,
        retryCount: true,
        lastError: true,
        resolvedAt: true,
      },
    });
    return {
      ticketStableId: row.ticketStableId,
      status: toDomainTicketStatus(row.status),
      retryCount: row.retryCount,
      lastError: row.lastError,
      resolvedAt: row.resolvedAt,
    };
  }
}
@Injectable()
export class UberOpsTicketPrismaRepository extends TicketRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }
}
@Injectable()
export class UberOperationsPrismaUnitOfWork implements UberOperationsUnitOfWorkPort {
  constructor(private readonly prisma: PrismaService) {}
  transaction<T>(work: (scope: UberOperationsRepositoryScope) => Promise<T>) {
    return this.prisma.$transaction((tx) =>
      work({ tickets: new TicketRepository(tx) }),
    );
  }
}
