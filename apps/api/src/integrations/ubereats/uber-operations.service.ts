import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Channel,
  OrderStatus,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
  type Prisma,
} from '@prisma/client';
import { AppLogger } from '../../common/app-logger';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeUberStoreId } from './uber-integration.utils';
import { UberMenuService } from './uber-menu.service';
import { UberMerchantService } from './uber-merchant.service';
import type {
  CreateOpsTicketInput,
  GenerateReconciliationReportInput,
  MenuItemAvailabilityContext,
  MenuPublishContext,
  OrderStatusSyncContext,
  StoreStatusSyncContext,
} from './uber-operations.types';
import { UberOrderService } from './uber-order.service';
import { UberPrismaAccessService } from './uber-prisma-access.service';

@Injectable()
export class UberOperationsService {
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private readonly logger = new AppLogger(UberOperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: UberOrderService,
    private readonly menu: UberMenuService,
    private readonly merchant: UberMerchantService,
    private readonly prismaAccess: UberPrismaAccessService,
  ) {}

  async generateReconciliationReport(input: GenerateReconciliationReportInput) {
    const normalizedStoreId = normalizeUberStoreId(input.storeId);
    const range = this.resolveReportRange(input.rangeStart, input.rangeEnd);

    const [orders, failedSyncEvents, openTickets] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          channel: Channel.ubereats,
          createdAt: {
            gte: range.rangeStart,
            lt: range.rangeEnd,
          },
        },
        select: {
          status: true,
          totalCents: true,
        },
      }),
      this.prisma.opsEvent.count({
        where: {
          source: 'ubereats',
          eventName: {
            in: [
              'ubereats_order_sync_failed',
              'ubereats_menu_publish_failed',
              'ubereats_menu_item_availability_sync_failed',
            ],
          },
          createdAt: {
            gte: range.rangeStart,
            lt: range.rangeEnd,
          },
        },
      }),
      this.prismaAccess.uberOpsTicketRepository.count({
        where: {
          storeId: normalizedStoreId,
          status: {
            in: [UberOpsTicketStatus.OPEN, UberOpsTicketStatus.IN_PROGRESS],
          },
        },
      }),
    ]);

    const summary = {
      totalOrders: orders.length,
      totalAmountCents: orders.reduce((sum, row) => sum + row.totalCents, 0),
      syncedOrders: orders.filter((row) => row.status !== OrderStatus.pending)
        .length,
      pendingOrders: orders.filter((row) => row.status === OrderStatus.pending)
        .length,
      failedSyncEvents,
      discrepancyOrders: openTickets,
    };

    const payload: Prisma.JsonObject = {
      rangeStart: range.rangeStart.toISOString(),
      rangeEnd: range.rangeEnd.toISOString(),
      summary,
    };

    const report = await this.prisma.uberReconciliationReport.create({
      data: {
        storeId: normalizedStoreId,
        rangeStart: range.rangeStart,
        rangeEnd: range.rangeEnd,
        ...summary,
        payload,
      },
      select: {
        reportStableId: true,
        createdAt: true,
      },
    });

    await this.captureEvent('ubereats_reconciliation_report_generated', {
      storeId: normalizedStoreId,
      reportStableId: report.reportStableId,
      ...summary,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      reportStableId: report.reportStableId,
      createdAt: report.createdAt,
      ...summary,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
    };
  }

  async listReconciliationReports(storeId?: string, limit = 20) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
    const take = Math.min(Math.max(1, Number(limit) || 20), 100);

    const rows = await this.prisma.uberReconciliationReport.findMany({
      where: { storeId: normalizedStoreId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        reportStableId: true,
        rangeStart: true,
        rangeEnd: true,
        totalOrders: true,
        totalAmountCents: true,
        failedSyncEvents: true,
        discrepancyOrders: true,
        createdAt: true,
      },
    });

    return {
      storeId: normalizedStoreId,
      count: rows.length,
      items: rows,
    };
  }

  async createOpsTicket(input: CreateOpsTicketInput) {
    const normalizedStoreId = normalizeUberStoreId(input.storeId);

    // Parse at creation time too, so manually-created tickets can never be
    // persisted in a form which is known to be impossible to retry.
    const context = this.parseOpsTicketContext(input.type, input.context);

    if (input.externalOrderId) {
      await this.ensureUberOrderExists(input.externalOrderId);
    }
    if (input.menuItemStableId) {
      await this.ensureMenuItemExists(input.menuItemStableId);
    }

    const ticket = await this.prismaAccess.uberOpsTicketRepository.create({
      data: {
        storeId: normalizedStoreId,
        type: input.type,
        status: UberOpsTicketStatus.OPEN,
        priority: input.priority ?? UberOpsTicketPriority.MEDIUM,
        title: input.title,
        description: input.description,
        externalOrderId: input.externalOrderId,
        menuItemStableId: input.menuItemStableId,
        context: context,
      },
      select: {
        ticketStableId: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    });

    await this.captureEvent('ubereats_ops_ticket_created', {
      storeId: normalizedStoreId,
      ticketStableId: ticket.ticketStableId,
      type: input.type,
      priority: ticket.priority,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      ...ticket,
    };
  }

  async listOpsTickets(storeId?: string, status?: UberOpsTicketStatus) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
    const rows = await this.prismaAccess.uberOpsTicketRepository.findMany({
      where: {
        storeId: normalizedStoreId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        ticketStableId: true,
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

    return {
      storeId: normalizedStoreId,
      count: rows.length,
      items: rows,
    };
  }

  async retryOpsTicket(ticketStableId: string) {
    const ticket = await this.prismaAccess.uberOpsTicketRepository.findUnique({
      where: { ticketStableId },
    });

    if (!ticket) {
      throw new BadRequestException(`工单 ${ticketStableId} 不存在`);
    }

    let errorMessage: string | null = null;

    try {
      await this.prismaAccess.uberOpsTicketRepository.update({
        where: { ticketStableId },
        data: { status: UberOpsTicketStatus.IN_PROGRESS },
      });

      if (ticket.type === UberOpsTicketType.ORDER_STATUS_SYNC) {
        if (!ticket.externalOrderId) {
          throw new BadRequestException('订单状态同步工单缺少 externalOrderId');
        }
        const context = this.parseOrderStatusSyncContext(ticket.context);
        await this.orders.syncOrderStatusToUber(
          ticket.externalOrderId,
          context.targetStatus,
        );
      } else if (ticket.type === UberOpsTicketType.STORE_STATUS_SYNC) {
        const context = this.parseStoreStatusSyncContext(ticket.context);
        const result = await this.merchant.syncStoreStatusToUber(context);
        if (!result.ok) throw new Error('Uber 门店状态同步失败');
      } else if (ticket.type === UberOpsTicketType.MENU_PUBLISH) {
        const context = this.parseMenuPublishContext(ticket.context);
        await this.menu.publishUberMenu(context.publish);
      } else if (ticket.type === UberOpsTicketType.MENU_ITEM_AVAILABILITY) {
        if (!ticket.menuItemStableId) {
          throw new BadRequestException('商品状态工单缺少 menuItemStableId');
        }
        const context = this.parseMenuItemAvailabilityContext(ticket.context);
        await this.menu.syncUberMenuItemAvailability({
          storeId: ticket.storeId,
          menuItemStableId: ticket.menuItemStableId,
          isAvailable: context.isAvailable,
        });
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'unknown_error';
    }

    const updated = await this.prismaAccess.uberOpsTicketRepository.update({
      where: { ticketStableId },
      data: errorMessage
        ? {
            status: UberOpsTicketStatus.OPEN,
            retryCount: { increment: 1 },
            lastError: errorMessage,
          }
        : {
            status: UberOpsTicketStatus.RESOLVED,
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

    await this.captureEvent('ubereats_ops_ticket_retried', {
      ticketStableId,
      status: updated.status,
      retryCount: updated.retryCount,
      ...(updated.lastError ? { lastError: updated.lastError } : {}),
    });

    return {
      ok: !updated.lastError,
      ...updated,
    };
  }

  private parseOpsTicketContext(
    type: UberOpsTicketType,
    value: unknown,
  ): Prisma.JsonObject {
    if (type === UberOpsTicketType.ORDER_STATUS_SYNC)
      return this.parseOrderStatusSyncContext(
        value,
      ) as unknown as Prisma.JsonObject;
    if (type === UberOpsTicketType.MENU_ITEM_AVAILABILITY)
      return this.parseMenuItemAvailabilityContext(
        value,
      ) as unknown as Prisma.JsonObject;
    if (type === UberOpsTicketType.STORE_STATUS_SYNC)
      return this.parseStoreStatusSyncContext(
        value,
      ) as unknown as Prisma.JsonObject;
    if (type === UberOpsTicketType.MENU_PUBLISH)
      return this.parseMenuPublishContext(
        value,
      ) as unknown as Prisma.JsonObject;
    throw new BadRequestException('不支持的工单类型');
  }

  private requireContext(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('工单缺少合法的结构化 context');
    return value as Record<string, unknown>;
  }

  private parseOrderStatusSyncContext(value: unknown): OrderStatusSyncContext {
    const context = this.requireContext(value);
    if (
      !Object.values(OrderStatus).includes(context.targetStatus as OrderStatus)
    )
      throw new BadRequestException('订单状态同步工单的 targetStatus 非法');
    return { targetStatus: context.targetStatus as OrderStatus };
  }

  private parseMenuItemAvailabilityContext(
    value: unknown,
  ): MenuItemAvailabilityContext {
    const context = this.requireContext(value);
    if (typeof context.isAvailable !== 'boolean')
      throw new BadRequestException('商品状态工单缺少布尔值 isAvailable');
    return { isAvailable: context.isAvailable };
  }

  private parseStoreStatusSyncContext(value: unknown): StoreStatusSyncContext {
    const context = this.requireContext(value);
    if (typeof context.uberStoreId !== 'string' || !context.uberStoreId.trim())
      throw new BadRequestException('门店状态工单缺少 uberStoreId');
    if (context.targetStatus !== 'ONLINE' && context.targetStatus !== 'PAUSED')
      throw new BadRequestException('门店状态工单的 targetStatus 非法');
    return {
      uberStoreId: context.uberStoreId,
      targetStatus: context.targetStatus,
      ...(typeof context.reason === 'string' ? { reason: context.reason } : {}),
      ...(typeof context.pauseUntil === 'string'
        ? { pauseUntil: context.pauseUntil }
        : {}),
    };
  }

  private parseMenuPublishContext(value: unknown): MenuPublishContext {
    const context = this.requireContext(value);
    const publish = this.requireContext(context.publish);
    if (
      typeof publish.storeId !== 'string' ||
      !publish.storeId.trim() ||
      publish.dryRun !== false
    )
      throw new BadRequestException('菜单发布工单缺少完整的 publish 参数');
    const arrayKeys = [
      'excludedCategoryIds',
      'excludedGroupIds',
      'excludedMenuItemStableIds',
      'excludedOptionChoiceStableIds',
    ] as const;
    for (const key of arrayKeys) {
      if (
        publish[key] !== undefined &&
        (!Array.isArray(publish[key]) ||
          !(publish[key] as unknown[]).every(
            (item) => typeof item === 'string',
          ))
      )
        throw new BadRequestException(`菜单发布工单的 ${key} 非法`);
    }
    for (const key of ['timezoneConfirmed', 'taxRateConfirmed'] as const) {
      if (publish[key] !== undefined && typeof publish[key] !== 'boolean')
        throw new BadRequestException(`菜单发布工单的 ${key} 非法`);
    }
    return {
      ...(typeof context.versionId === 'string'
        ? { versionId: context.versionId }
        : {}),
      publish: publish as MenuPublishContext['publish'],
    };
  }

  private resolveReportRange(rangeStart?: string, rangeEnd?: string) {
    const end = rangeEnd ? new Date(rangeEnd) : new Date();
    const start = rangeStart
      ? new Date(rangeStart)
      : new Date(end.getTime() - 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('对账时间范围格式不正确');
    }

    if (start >= end) {
      throw new BadRequestException('对账时间范围不合法：start 必须早于 end');
    }

    return {
      rangeStart: start,
      rangeEnd: end,
    };
  }

  private async ensureUberOrderExists(externalOrderId: string) {
    const row = await this.prisma.order.findUnique({
      where: {
        clientRequestId: this.toClientRequestId(externalOrderId),
      },
      select: { id: true },
    });

    if (!row) {
      throw new BadRequestException(`Uber 订单 ${externalOrderId} 不存在`);
    }
  }

  private toClientRequestId(externalOrderId: string): string {
    return `ubereats:${externalOrderId}`;
  }

  private async ensureMenuItemExists(menuItemStableId: string) {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { stableId: menuItemStableId },
      select: { stableId: true },
    });

    if (!menuItem) {
      throw new BadRequestException(`菜单项 ${menuItemStableId} 不存在`);
    }
  }

  private async captureEvent(eventName: string, payload: Prisma.JsonObject) {
    await this.prisma.opsEvent.create({
      data: {
        eventName,
        source: 'ubereats',
        payload,
      },
    });
  }
}
